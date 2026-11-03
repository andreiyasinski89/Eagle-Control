import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

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
import { findSilentContacts } from "@/server/services/crm/silence";
import { renderTimersTable, timersTableFor } from "../../../agent/timers";
import { runAgent } from "../../../agent/run";
import type { AgentModel } from "../../../agent/model";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let other: string;
let ws: { id: string };
const ids: Record<string, string> = {};

const base = { emails: [], phones: [], messengers: {}, allowDuplicate: false };

async function person(key: string, over: { stage: "NEW" | "WARMING" | "DECIDING" | "NO_REPLY" | "PRESENTATION"; temperature?: "HOT" | "WARM" | "COLD"; consent?: boolean; owner?: string; touched?: number | null; replied?: number | null }) {
  const id = (await createContact(over.owner ?? owner, ws.id, { ...base, firstName: key, consentGiven: over.consent ?? true, stage: over.stage, temperature: over.temperature ?? null, ownerId: over.owner ?? owner })).id;
  await raw.contact.update({ where: { nodeId: id }, data: { stageChangedAt: ago(24 * 30), lastContactedAt: over.touched === undefined ? null : over.touched === null ? null : ago(over.touched), repliedAt: over.replied ? ago(over.replied) : null } });
  ids[key] = id;
  return id;
}

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  other = (await t.db.user.create({ data: { email: "p@x.io", name: "Peer" } })).id;
  ws = await createWorkspace(owner, "MWR");
  await t.db.membership.create({ data: { userId: other, workspaceId: ws.id, role: "MEMBER", crmAccess: true } });

  await person("Валентин", { stage: "WARMING", temperature: "HOT", touched: 24 * 5 });
  await person("Ваня", { stage: "WARMING", temperature: "WARM", touched: 24 * 2 }); // inside the norm
  await person("Никита", { stage: "DECIDING", temperature: "HOT", touched: 24 * 3 });
  await person("Арамис", { stage: "NO_REPLY", touched: 24 * 8, consent: false });
  await person("Ответил", { stage: "NEW", replied: 30, touched: 40 });
  await person("Ответил и получил ответ", { stage: "NEW", replied: 30, touched: 5 });
  await person("Презентант", { stage: "PRESENTATION", touched: 3 });
  await person("Чужой", { stage: "WARMING", touched: 24 * 9, owner: other });
  await createActivity(owner, ws.id, { type: "MESSAGE", subject: "Касание: без ответа", body: "Валентин, привет!", contactId: ids["Валентин"]! });
  await raw.contact.update({ where: { nodeId: ids["Валентин"]! }, data: { lastContactedAt: ago(24 * 5) } }); // the logged touch above stamped "now"
  await createActivity(owner, ws.id, { type: "MEETING", subject: "Презентация по видеозвонку", dueAt: new Date(NOW.getTime() + 90 * 60_000).toISOString(), completed: false, contactId: ids["Презентант"]! });
}, 120_000);
afterAll(async () => close?.());

describe("Silent contacts", () => {
  it("finds the person's own contacts past their timer, most urgent first", async () => {
    const found = await findSilentContacts(owner, ws.id, NOW);
    expect(found.map((c) => [c.name, c.hit.kind])).toEqual([
      ["Ответил", "replied"],
      ["Презентант", "meeting_soon"],
      ["Никита", "deciding"],
      ["Валентин", "warming"],
      ["Арамис", "no_reply"],
    ]);
    expect(found.find((c) => c.name === "Арамис")).toMatchObject({ consentGiven: false });
    expect(found.find((c) => c.name === "Валентин")?.last).toMatchObject({ type: "MESSAGE", subject: "Касание: без ответа" });
  });

  it("does not show a colleague's book to the user, and vice versa", async () => {
    expect((await findSilentContacts(other, ws.id, NOW)).map((c) => c.name)).toEqual(["Чужой"]);
  });
});

describe("The follow-up table and role", () => {
  it("renders one line per contact with stage, silence, action, last event and consent", async () => {
    const { table, count } = await timersTableFor(owner, ws.id, NOW);
    expect(count).toBe(5);
    expect(table).toContain("Найдено: 5");
    expect(table).toMatch(/- Ответил \[id [^\]]+\] \| NEW \| тишина 1 дн\. \| красный флаг/);
    expect(table).toMatch(/- Валентин .* \| WARMING, HOT \| тишина 5 дн\. \| повторное касание с поводом \| последнее: MESSAGE 2026-\d\d-\d\d «Касание: без ответа» \| согласие есть/);
    expect(table).toMatch(/- Арамис .* \| NO_REPLY \| тишина 8 дн\. .* последнее: истории нет \| нужно согласие/);
    expect(table).toMatch(/- Презентант .* встреча в 13:30 UTC .* напомнить и подтвердить/);
  });

  it("says so plainly when there is nothing, and cuts a long list", () => {
    expect(renderTimersTable([])).toBe("таких контактов нет");
    const item = { contactId: "c", name: "N", stage: "WARMING" as const, temperature: null, consentGiven: true, hit: { kind: "warming" as const, since: ago(100), silentHours: 100, overdueHours: 4 }, last: null };
    const table = renderTimersTable(Array.from({ length: 33 }, () => item));
    expect(table).toContain("Найдено: 33");
    expect(table).toContain("…и ещё 3");
    expect(table.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(30);
  });

  it("fills {timers_table} from the CRM and hands it to the model", async () => {
    const seen: string[] = [];
    const model: AgentModel = {
      async complete(req) {
        seen.push(String(req.messages[0]!.content));
        return { content: [{ type: "text", text: "Пять контактов, начни с Ответил." }], stopReason: "end_turn", inputTokens: 10, outputTokens: 5, model: "scripted" };
      },
    };
    const vars = { user_name: "Андрей", goal: "Gold", deadline: "31.12", touches_per_day: 20, meetings_per_day: 4 };
    const run = await runAgent({ userId: owner, workspaceId: ws.id, role: "stale_followups", vars, model, now: NOW });
    expect(run.output).toBe("Пять контактов, начни с Ответил.");
    expect(seen[0]).toContain("Найдено: 5");
    expect(seen[0]).not.toMatch(/\{timers_table\}/);
  });

  it("spends no tokens and calls no model when no timer has run out", async () => {
    const quiet = await createWorkspace(other, "Quiet");
    const model: AgentModel = {
      async complete() {
        throw new Error("the model must not be called");
      },
    };
    const vars = { user_name: "Пир", goal: "Gold", deadline: "31.12", touches_per_day: 20, meetings_per_day: 4 };
    const run = await runAgent({ userId: other, workspaceId: quiet.id, role: "stale_followups", vars, model, now: NOW });
    expect(run).toMatchObject({ output: "Просроченных таймеров тишины нет.", tokens: 0, toolCalls: [] });
    expect(await raw.agentRun.count({ where: { id: run.id, role: "stale_followups", tokens: 0 } })).toBe(1);
    expect(await raw.aiUsage.count({ where: { workspaceId: quiet.id } })).toBe(0);
  });
});
