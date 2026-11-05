import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "@/tests/integration/pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { createActivity } from "@/server/services/crm/activities";
import { createContact } from "@/server/services/crm/contacts";
import { createDeal } from "@/server/services/crm/deals";
import { AgentPromptError, render } from "./prompts";
import { promptsFor } from "./roles";
import { runAgent } from "./run";
import type { AgentModel, Block, ModelReply, ModelRequest } from "./model";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let outsider: string;
let ws: { id: string };
let valentinId: string;
let annaId: string;
let foreignContactId: string;

const VARS = { user_name: "Андрей", goal: "статус Gold", deadline: "31 декабря", touches_per_day: 20, meetings_per_day: 4, date: "2026-11-03" };

const reply = (content: Block[], stopReason: ModelReply["stopReason"] = "tool_use"): ModelReply => ({ content, stopReason, inputTokens: 100, outputTokens: 50, model: "scripted" });
const toolUse = (id: string, name: string, input: Record<string, unknown>): Block => ({ type: "tool_use", id, name, input });

/** A model that plays a fixed script and sees what the agent loop sent it, like the real one would. */
function scripted(steps: ((req: ModelRequest) => ModelReply)[]): AgentModel & { requests: ModelRequest[] } {
  const requests: ModelRequest[] = [];
  return {
    requests,
    async complete(req) {
      requests.push(structuredClone(req));
      const step = steps[requests.length - 1];
      if (!step) throw new Error("The script ran out of steps");
      return step(req);
    },
  };
}

/** The text of the tool results the agent sent back in the last user message. */
function lastResults(req: ModelRequest): { id: string; content: string; isError: boolean }[] {
  const last = req.messages[req.messages.length - 1];
  if (!last || typeof last.content === "string") return [];
  return last.content.flatMap((b) => (b.type === "tool_result" ? [{ id: b.tool_use_id, content: b.content, isError: b.is_error ?? false }] : []));
}

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "andrey@x.io", name: "Андрей" } })).id;
  outsider = (await t.db.user.create({ data: { email: "other@x.io", name: "Other" } })).id;
  ws = await createWorkspace(owner, "MWR");
  await raw.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  const other = await createWorkspace(outsider, "Other");

  const base = { emails: [], phones: [], messengers: {}, allowDuplicate: false };
  valentinId = (await createContact(owner, ws.id, { ...base, firstName: "Валентин", messengers: { telegram: "@valentin_kos" }, consentGiven: true, stage: "WARMING", temperature: "HOT" })).id;
  annaId = (await createContact(owner, ws.id, { ...base, firstName: "Анна", consentGiven: false, stage: "WARMING", temperature: "WARM" })).id;
  foreignContactId = (await createContact(outsider, other.id, { ...base, firstName: "Чужой", consentGiven: true })).id;
  await createActivity(owner, ws.id, { type: "MESSAGE", subject: "Касание: ответил(а)", body: "Валентин, привет! Как дела?", contactId: valentinId });
}, 120_000);
afterAll(async () => close?.());

describe("Morning briefing role", () => {
  it("reads the CRM through the tools, answers from what it read, and logs the run", async () => {
    const activitiesBefore = await raw.crmActivity.count();
    const model = scripted([
      () => reply([toolUse("t1", "my_day", {}), toolUse("t2", "get_calendar", { from: "2026-11-03", to: "2026-11-03", mine: "1" }), toolUse("t3", "list_contacts", { stage: "WARMING" })]),
      (req) => {
        const results = lastResults(req);
        expect(results.map((r) => r.id)).toEqual(["t1", "t2", "t3"]);
        expect(results.every((r) => !r.isError)).toBe(true);
        const contacts = JSON.parse(results[2]!.content) as { items: { id: string; name: string; consentGiven: boolean }[] };
        const valentin = contacts.items.find((c) => c.id === valentinId);
        const anna = contacts.items.find((c) => c.id === annaId);
        expect(valentin).toMatchObject({ name: "Валентин", consentGiven: true });
        expect(anna).toMatchObject({ name: "Анна", consentGiven: false });
        return reply([{ type: "text", text: `Горит: ${valentin!.name}. Починить данные: ${anna!.name} — нужно согласие.` }], "end_turn");
      },
    ]);

    const run = await runAgent({ userId: owner, workspaceId: ws.id, role: "morning_briefing", vars: VARS, model });

    expect(run.output).toBe("Горит: Валентин. Починить данные: Анна — нужно согласие.");
    expect(run.toolCalls.map((c) => c.name)).toEqual(["my_day", "get_calendar", "list_contacts"]);
    expect(run.tokens).toBe(300);

    // The model got both prompts filled in, and the tools in the shape the Messages API wants.
    const first = model.requests[0]!;
    expect(first.system).toContain("амбассадора MWR Life Андрей");
    expect(first.system).toContain("20 касаний, 4 презентаций");
    expect(first.system).toContain("НИКОГДА не отправляешь");
    expect(first.system).not.toMatch(/\{[a-z_]+\}/);
    expect(first.messages[0]).toEqual({ role: "user", content: expect.stringContaining("Сегодня 2026-11-03. Подготовь утренний брифинг.") });
    expect(first.tools.map((t) => t.name).sort()).toEqual(["create_draft", "get_calendar", "get_contact", "list_activities", "list_contacts", "log_activity", "move_deal", "my_day", "update_contact", "update_deal"]);
    expect(first.tools.every((t) => t.input_schema.type === "object")).toBe(true);

    // agent_runs keeps the whole run.
    const row = await raw.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(row).toMatchObject({ workspaceId: ws.id, userId: owner, role: "morning_briefing", output: run.output, tokens: 300 });
    expect(row.input).toContain("Подготовь утренний брифинг");
    expect((row.toolCalls as { name: string; isError: boolean }[]).map((c) => [c.name, c.isError])).toEqual([["my_day", false], ["get_calendar", false], ["list_contacts", false]]);

    // The use counts toward the workspace's AI allowance; a briefing writes nothing into the CRM.
    expect(await raw.aiUsage.count({ where: { workspaceId: ws.id, feature: "agent:morning_briefing" } })).toBe(1);
    expect(await raw.crmActivity.count()).toBe(activitiesBefore);
  });

  it("stops with a readable error when a variable is missing, before any model call", async () => {
    const model = scripted([]);
    const withoutDate: Record<string, string | number> = { ...VARS };
    delete withoutDate.date;
    await expect(runAgent({ userId: owner, workspaceId: ws.id, role: "morning_briefing", vars: withoutDate, model })).rejects.toThrow(/Missing prompt variables: date/);
    expect(model.requests).toHaveLength(0);
  });
});

describe("What the agent writes into the CRM", () => {
  it("marks the activity as source=agent with the [агент] prefix, and refuses ids of another workspace", async () => {
    const model = scripted([
      () =>
        reply([
          toolUse("w1", "log_activity", { type: "NOTE", subject: "Валентин хочет созвон про команду", body: "Договорились обсудить в четверг", contactId: valentinId }),
          toolUse("w2", "log_activity", { type: "NOTE", subject: "Не должно записаться", contactId: foreignContactId }),
        ]),
      (req) => {
        const [ok, foreign] = lastResults(req);
        expect(ok!.isError).toBe(false);
        expect(foreign!.isError).toBe(true);
        return reply([{ type: "text", text: "Записал." }], "end_turn");
      },
    ]);

    const run = await runAgent({ userId: owner, workspaceId: ws.id, role: "call_summary", vars: { ...VARS, transcript: "Говорил с Валентином, ему интересно, {не трогай}" }, model });
    expect(run.toolCalls.map((c) => c.isError)).toEqual([false, true]);

    const written = await raw.crmActivity.findMany({ where: { source: "agent" } });
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ type: "NOTE", contactId: valentinId, subject: "[агент] Валентин хочет созвон про команду", ownerId: owner });
    // Nothing is marked for people: the app's own rows keep source = null.
    expect(await raw.crmActivity.count({ where: { source: null } })).toBeGreaterThan(0);
    expect(await raw.crmActivity.count({ where: { contactId: foreignContactId } })).toBe(0);
    // The dictated text went into the prompt as it is, braces included.
    expect(model.requests[0]!.messages[0]).toMatchObject({ content: expect.stringContaining("{не трогай}") });
  });

  it("moves a deal as source=agent and leaves a [агент] note without being asked", async () => {
    const stages = await raw.pipelineStage.findMany({ where: { pipeline: { workspaceId: ws.id, isDefault: true } }, orderBy: { order: "asc" } });
    const deal = await createDeal(owner, ws.id, { title: "Валентин — команда", amount: 0, currency: "EUR", primaryContactId: valentinId });
    const target = stages.find((s) => s.id !== deal.stageId && !s.isLost && !s.isWon)!;
    const model = scripted([
      () => reply([toolUse("m1", "move_deal", { id: deal.id, stageId: target.id }), toolUse("m2", "update_deal", { id: deal.id, nextStep: "Созвон про команду", nextStepAt: "2026-11-06T17:00:00.000Z", source: "hacked" })]),
      () => reply([{ type: "text", text: "Готово." }], "end_turn"),
    ]);

    const run = await runAgent({ userId: owner, workspaceId: ws.id, role: "call_summary", vars: { ...VARS, transcript: "ок" }, model });
    expect(run.toolCalls.map((c) => c.isError)).toEqual([false, false]);

    const events = await raw.dealStageEvent.findMany({ where: { dealId: deal.id, toStageId: target.id } });
    expect(events.map((e) => e.source)).toEqual(["agent"]);
    const after = await raw.deal.findUniqueOrThrow({ where: { nodeId: deal.id } });
    expect(after).toMatchObject({ stageId: target.id, nextStep: "Созвон про команду" });
    expect(after.source).not.toBe("hacked"); // the lead origin of a deal is not the agent's to rewrite
    const notes = await raw.crmActivity.findMany({ where: { dealId: deal.id, source: "agent" }, orderBy: { createdAt: "asc" } });
    expect(notes.map((n) => n.subject)).toEqual(["[агент] Сделка перемещена", "[агент] Сделка обновлена"]);
  });

  it("saves drafts only through create_draft: a draft with consent, a task without, nothing sent", async () => {
    const model = scripted([
      () => reply([toolUse("d1", "create_draft", { contactId: valentinId, channel: "TELEGRAM", text: "Валентин, привет! Как тебе вчерашняя презентация?", reason: "был на офлайн-презентации" }), toolUse("d2", "create_draft", { contactId: annaId, text: "Анна, привет!" })]),
      (req) => {
        const [withConsent, without] = lastResults(req).map((r) => JSON.parse(r.content) as Record<string, unknown>);
        expect(withConsent).toMatchObject({ status: "draft_created" });
        expect(without).toMatchObject({ status: "consent_required", taskCreated: true });
        return reply([{ type: "text", text: "Черновик для Валентина сохранён; для Анны нужно согласие." }], "end_turn");
      },
    ]);
    await runAgent({ userId: owner, workspaceId: ws.id, role: "morning_briefing", vars: VARS, model });

    expect(await raw.agentDraft.findMany({ where: { contactId: valentinId }, select: { status: true, userId: true, reason: true } })).toEqual([{ status: "PENDING", userId: owner, reason: "был на офлайн-презентации" }]);
    expect(await raw.agentDraft.count({ where: { contactId: annaId } })).toBe(0);
    expect(await raw.crmActivity.count({ where: { contactId: annaId, type: "TASK", source: "agent" } })).toBe(1);
    expect(await raw.crmActivity.count({ where: { contactId: valentinId, type: "MESSAGE", source: "agent" } })).toBe(0);
  });

  it("changes a contact only after its history was read, and leaves a before → after note", async () => {
    const contactId = (await createContact(owner, ws.id, { emails: [], phones: [], messengers: {}, allowDuplicate: false, firstName: "Нона", consentGiven: false, stage: "WARMING", temperature: "WARM" })).id;
    const change = { id: contactId, stage: "PRESENTATION", temperature: "HOT", nextStep: "Презентация по видеозвонку", nextStepAt: "2026-11-05T17:00:00.000Z", consentGiven: true };
    const model = scripted([
      () => reply([toolUse("u1", "update_contact", change)]),
      (req) => {
        expect(lastResults(req)[0]).toMatchObject({ isError: true, content: expect.stringContaining("list_activities") });
        return reply([toolUse("u2", "list_activities", { contactId }), toolUse("u3", "update_contact", change)]);
      },
      (req) => {
        const [, applied] = lastResults(req);
        expect(applied).toMatchObject({ isError: false });
        expect(JSON.parse(applied!.content)).toMatchObject({ stage: "PRESENTATION", temperature: "HOT", nextStep: "Презентация по видеозвонку" });
        return reply([{ type: "text", text: "Нона переведена на презентацию." }], "end_turn");
      },
    ]);
    await runAgent({ userId: owner, workspaceId: ws.id, role: "call_summary", vars: { ...VARS, transcript: "Нона согласна на презентацию" }, model });

    const c = await raw.contact.findUniqueOrThrow({ where: { nodeId: contactId } });
    expect(c).toMatchObject({ stage: "PRESENTATION", temperature: "HOT", nextStep: "Презентация по видеозвонку", consentGiven: false }); // consent is not the agent's to give
    expect(await raw.contactStageEvent.findMany({ where: { contactNodeId: contactId }, select: { fromStage: true, toStage: true, source: true } })).toEqual(expect.arrayContaining([{ fromStage: "WARMING", toStage: "PRESENTATION", source: "agent" }]));
    const note = await raw.crmActivity.findFirstOrThrow({ where: { contactId, source: "agent", type: "NOTE" } });
    expect(note.subject).toBe("[агент] Контакт обновлён");
    expect(note.body).toBe("Стадия: WARMING → PRESENTATION\nТемпература: WARM → HOT\nСледующий шаг: Презентация по видеозвонку (2026-11-05)");
  });

  it("keeps a failed run in agent_runs", async () => {
    const model: AgentModel = {
      async complete() {
        throw new Error("model is down");
      },
    };
    await expect(runAgent({ userId: owner, workspaceId: ws.id, role: "morning_briefing", vars: VARS, model })).rejects.toThrow("model is down");
    const row = await raw.agentRun.findFirstOrThrow({ where: { output: { startsWith: "[error]" } } });
    expect(row.output).toBe("[error] model is down");
  });
});

describe("A run that never says a word until it is told to", () => {
  const call = (i: number) => reply([toolUse(`c${i}`, "my_day", {})]);

  it("gets through 25 one-call turns and then answers", async () => {
    let n = 0;
    const model: AgentModel = { async complete() { n++; return n <= 25 ? call(n) : reply([{ type: "text", text: "Итог готов." }], "end_turn"); } };
    const run = await runAgent({ userId: owner, workspaceId: ws.id, role: "morning_briefing", vars: VARS, model });
    expect(run.output).toBe("Итог готов.");
    expect(run.toolCalls).toHaveLength(25);
  });

  it("on its last turn may not call tools and is asked for the answer", async () => {
    const seen: ModelRequest[] = [];
    const model: AgentModel = {
      async complete(req) {
        seen.push(structuredClone(req));
        return req.forbidTools ? reply([{ type: "text", text: "Вот что успел собрать." }], "end_turn") : call(seen.length);
      },
    };
    const run = await runAgent({ userId: owner, workspaceId: ws.id, role: "morning_briefing", vars: VARS, model, maxTurns: 4 });
    expect(run.output).toBe("Вот что успел собрать.");
    expect(seen).toHaveLength(4);
    expect(seen.slice(0, 3).every((r) => !r.forbidTools)).toBe(true);
    expect(seen[3]!.forbidTools).toBe(true);
    expect(JSON.stringify(seen[3]!.messages.at(-1))).toContain("Лимит шагов исчерпан");
  });

  it("asks once more, without tools, when the model ended with nothing", async () => {
    const seen: ModelRequest[] = [];
    const model: AgentModel = {
      async complete(req) {
        seen.push(structuredClone(req));
        return seen.length === 1 ? reply([toolUse("a", "my_day", {})]) : seen.length === 2 ? reply([], "end_turn") : reply([{ type: "text", text: "Ответ со второй попытки." }], "end_turn");
      },
    };
    const run = await runAgent({ userId: owner, workspaceId: ws.id, role: "morning_briefing", vars: VARS, model });
    expect(run.output).toBe("Ответ со второй попытки.");
    expect(seen[2]!.forbidTools).toBe(true);
    // The empty assistant message is not sent back: the API refuses those.
    expect(seen[2]!.messages.some((m) => m.role === "assistant" && Array.isArray(m.content) && m.content.length === 0)).toBe(false);
  });

  it("says why when there is still nothing", async () => {
    const model: AgentModel = { async complete() { return reply([], "refusal"); } };
    await expect(runAgent({ userId: owner, workspaceId: ws.id, role: "morning_briefing", vars: VARS, model })).rejects.toThrow(/last stop: refusal/);
  });
});

describe("Prompts", () => {
  it("fills every role from agent/prompts and leaves no placeholder behind", () => {
    const extra = { timers_table: "Паша — 2 дня", transcript: "разговор" };
    for (const role of ["morning_briefing", "stale_followups", "call_summary"] as const) {
      const { system, user } = promptsFor(role, { ...VARS, ...extra });
      expect(`${system}\n${user}`).not.toMatch(/\{[a-z_]+\}/);
    }
    expect(promptsFor("stale_followups", { ...VARS, ...extra }).user).toContain("Паша — 2 дня");
  });

  it("expands in one pass and rejects missing variables", () => {
    expect(render("a {x} b {y}", { x: "{y}", y: 1 })).toBe("a {y} b 1");
    expect(() => render("{x}", {})).toThrow(AgentPromptError);
  });
});
