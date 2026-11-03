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
import { createContact, markReplied, updateContact } from "@/server/services/crm/contacts";
import { dayReportFor } from "./day-report";
import { runAgent } from "./run";
import type { AgentModel, ModelRequest } from "./model";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let ws: { id: string };

const VARS = { user_name: "Андрей", goal: "статус Gold", deadline: "8 ноября", touches_per_day: 20, meetings_per_day: 4, date: "2026-11-03" };
const base = { emails: [], phones: [], messengers: {}, allowDuplicate: false, consentGiven: true };
const dayStart = (offset: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d;
};

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner", timezone: "UTC" } })).id;
  ws = await createWorkspace(owner, "MWR");

  const warm = (await createContact(owner, ws.id, { ...base, firstName: "Валентин", ownerId: owner, stage: "NEW" })).id;
  const partner = (await createContact(owner, ws.id, { ...base, firstName: "Ирина", ownerId: owner, stage: "DECIDING" })).id;
  const replied = (await createContact(owner, ws.id, { ...base, firstName: "Никита", ownerId: owner, stage: "NEW" })).id;
  await updateContact(owner, warm, { stage: "WARMING" });
  await updateContact(owner, partner, { stage: "PARTNER" });
  await raw.contact.update({ where: { nodeId: replied }, data: { lastContactedAt: new Date(Date.now() - 40 * 3_600_000) } });
  await markReplied(owner, replied, new Date(Date.now() - 30 * 3_600_000));

  // Two earlier days in the history: the pace is read from them.
  for (const [offset, touches, meetings] of [[-1, 18, 3], [-2, 22, 5]] as const) {
    await raw.dayScore.create({ data: { userId: owner, workspaceId: ws.id, day: dayStart(offset), followUpsPlanned: 20, followUpsDone: touches, meetingsPlanned: 4, meetingsDone: meetings, closed: true } });
  }
}, 120_000);
afterAll(async () => close?.());

describe("The evening report data", () => {
  it("puts the plan against the fact, the funnel's movement, who waits and the pace into one block", async () => {
    const text = await dayReportFor(owner, ws.id, new Date(), new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10));
    expect(text).toMatch(/- касания: \d+ из \d+/);
    expect(text).toMatch(/- встречи \(презентации\): \d+ из \d+/);
    expect(text).toContain("новых партнёров и клиентов за день: 1");
    expect(text).toContain("Движение воронки за день: 2 переходов — NEW→WARMING: 1; DECIDING→PARTNER: 1.");
    expect(text).toContain("Добавлено новых контактов за день: 3.");
    expect(text).toContain("Ответили, а мы молчим больше 24 часов: 1 — Никита");
    expect(text).toContain("Темп за последние 7 дней (дней в истории: 2): касаний в среднем 20 в день, встреч 4 в день.");
    expect(text).toContain("До дедлайна: 5 дн.");
  });

  it("says so plainly when nothing happened and no deadline is given", async () => {
    const quiet = await raw.user.create({ data: { email: "q@x.io", name: "Quiet", timezone: "UTC" } });
    const w = await createWorkspace(quiet.id, "Quiet");
    const text = await dayReportFor(quiet.id, w.id, new Date());
    expect(text).toContain("переходов между стадиями не было");
    expect(text).toContain("таких нет");
    expect(text).toContain("истории дней пока нет");
    expect(text).toContain("До дедлайна: дата не задана.");
  });
});

describe("The evening report role", () => {
  it("hands the model the filled report and no tools, and stores the run", async () => {
    const seen: ModelRequest[] = [];
    const model: AgentModel = {
      async complete(req) {
        seen.push(structuredClone(req));
        // Even if a model asked for a tool, nothing would be run: this role only reads.
        return { content: [{ type: "text", text: "Касаний 0 из 0. Завтра: ответь Никите." }, { type: "tool_use", id: "t1", name: "log_activity", input: {} }], stopReason: "tool_use", inputTokens: 80, outputTokens: 20, model: "scripted" };
      },
    };
    const run = await runAgent({ userId: owner, workspaceId: ws.id, role: "evening_report", vars: VARS, model });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.tools).toEqual([]);
    expect(String(seen[0]!.messages[0]!.content)).toContain("Ответили, а мы молчим больше 24 часов: 1 — Никита");
    expect(String(seen[0]!.messages[0]!.content)).not.toMatch(/\{day_report\}/);
    expect(run).toMatchObject({ output: "Касаний 0 из 0. Завтра: ответь Никите.", toolCalls: [], tokens: 100 });
    expect(await raw.agentRun.count({ where: { id: run.id, role: "evening_report" } })).toBe(1);
    expect(await raw.crmActivity.count({ where: { workspaceId: ws.id, source: "agent" } })).toBe(0);
  });
});
