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
import { agentSettingsSchema, saveAgentSettings } from "@/server/services/crm/agent-settings";
import { runAgentNow } from "@/server/services/crm/agent-run-now";
import { runDueAgents } from "./schedule";
import type { AgentModel } from "./model";

let close: () => Promise<void>;
let raw: PrismaClient;
let on: string;
let off: string;
let flaky: string;
let tired: string;
let wsFlaky: string;
let wsTired: string;

const at = (hhmmZ: string) => new Date(`2026-11-03T${hhmmZ}:00.000Z`); // Warsaw is UTC+1
const settings = (over: Record<string, unknown> = {}) => agentSettingsSchema.parse({ enabled: true, briefingTime: "08:00", touchesPerDay: 20, meetingsPerDay: 4, goal: "Gold", deadline: "2026-11-08", dailyRunLimit: 40, ...over });

const prompts: string[] = [];
const model: AgentModel = {
  async complete(req) {
    prompts.push(String(req.messages[0]!.content));
    return { content: [{ type: "text", text: "Готово." }], stopReason: "end_turn", inputTokens: 10, outputTokens: 5, model: "scripted" };
  },
};
const broken: AgentModel = {
  async complete() {
    throw new Error("the model is down");
  },
};

async function person(email: string, over: { enabled?: boolean } = {}) {
  const userId = (await raw.user.create({ data: { email, name: email.split("@")[0]!, timezone: "Europe/Warsaw" } })).id;
  const ws = await createWorkspace(userId, email);
  await raw.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  await saveAgentSettings(userId, ws.id, settings({ enabled: over.enabled ?? true }));
  return { userId, wsId: ws.id };
}

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  on = (await person("on@x.io")).userId;
  off = (await person("off@x.io", { enabled: false })).userId;
  ({ userId: flaky, wsId: wsFlaky } = await person("flaky@x.io"));
  ({ userId: tired, wsId: wsTired } = await person("tired@x.io"));
  for (let i = 0; i < 3; i++) await raw.agentRun.create({ data: { workspaceId: wsTired, userId: tired, role: "morning_briefing", input: "", output: "[error] boom", createdAt: at("06:50") } });
}, 120_000);
afterAll(async () => close?.());

const runsOf = (userId: string, since = new Date(0)) => raw.agentRun.findMany({ where: { userId, createdAt: { gte: since } }, orderBy: { createdAt: "asc" } });
const DAY2 = new Date("2026-11-04T00:00:00.000Z");

describe("The agent's clock", () => {
  it("runs the morning briefing for whoever has the agent on, and not for anybody else", async () => {
    const r = await runDueAgents(at("07:05"), { model });
    expect(r.people).toBe(3); // on, flaky, tired
    expect(r.runs.filter((x) => x.userId === on)).toEqual([{ userId: on, role: "morning_briefing", outcome: "ok" }]);
    expect((await runsOf(on)).map((x) => [x.role, x.output])).toEqual([["morning_briefing", "Готово."]]);
    expect(await runsOf(off)).toEqual([]);
    // The prompt carries the person's own norms and goal from the settings.
    expect(prompts[0]).toContain("20");
    expect(prompts[0]).toContain("2026-11-03");
  });

  it("does not run the same role twice in a day", async () => {
    const before = (await runsOf(on)).length;
    await runDueAgents(at("07:20"), { model });
    expect((await runsOf(on)).length).toBe(before);
  });

  it("runs the follow-up check at the next slot, without calling the model when nobody has gone quiet", async () => {
    const calls = prompts.length;
    const r = await runDueAgents(at("08:05"), { model }); // 09:05 in Warsaw
    expect(r.runs.filter((x) => x.userId === on).map((x) => x.role)).toEqual(["stale_followups"]);
    expect(prompts.length).toBe(calls);
    expect((await runsOf(on)).at(-1)).toMatchObject({ role: "stale_followups", output: "Просроченных таймеров тишины нет.", tokens: 0 });
  });

  it("gives the evening report at 21:00", async () => {
    const r = await runDueAgents(at("20:05"), { model });
    expect(r.runs.filter((x) => x.userId === on).map((x) => x.role)).toEqual(["stale_followups", "evening_report"]);
    expect((await runsOf(on)).filter((x) => x.role === "evening_report")).toHaveLength(1);
  });

  it("keeps a failing person from stopping the others, records the failure and gives up after three", async () => {
    // Day two: everyone is due the morning briefing again; the model is down.
    const day2 = (hhmm: string) => new Date(`2026-11-04T${hhmm}:00.000Z`);
    const r1 = await runDueAgents(day2("07:05"), { model: broken });
    expect(r1.runs.filter((x) => x.userId === flaky)).toEqual([{ userId: flaky, role: "morning_briefing", outcome: "failed" }]);
    expect(r1.runs.filter((x) => x.userId === on)).toEqual([{ userId: on, role: "morning_briefing", outcome: "failed" }]);
    expect((await runsOf(flaky, DAY2)).map((x) => x.output)).toEqual(["[error] the model is down"]);

    await runDueAgents(day2("07:20"), { model: broken });
    await runDueAgents(day2("07:35"), { model: broken });
    expect(await runsOf(flaky, DAY2)).toHaveLength(3);
    await runDueAgents(day2("07:50"), { model: broken });
    expect(await runsOf(flaky, DAY2)).toHaveLength(3); // left alone until tomorrow
  });

  it("leaves a person who already failed three times today alone, even with a working model", async () => {
    const r = await runDueAgents(at("07:05"), { model });
    expect(r.runs.filter((x) => x.userId === tired)).toEqual([]);
  });

  it("skips someone whose plan has no AI, without a run on record", async () => {
    await raw.workspace.update({ where: { id: wsFlaky }, data: { plan: "FREE" } });
    const r = await runDueAgents(new Date("2026-11-05T07:05:00.000Z"), { model });
    expect(r.runs.filter((x) => x.userId === flaky)).toEqual([{ userId: flaky, role: "morning_briefing", outcome: "skipped" }]);
    expect(await runsOf(flaky, new Date("2026-11-05T00:00:00.000Z"))).toEqual([]);
  });
});

describe("Run now", () => {
  it("runs at once for a person the clock has paused after three failures, and shows what the agent wrote", async () => {
    const paused = await runDueAgents(at("07:05"), { model });
    expect(paused.runs.filter((x) => x.userId === tired)).toEqual([]); // the clock leaves them alone
    const r = await runAgentNow(tired, wsTired, "morning_briefing", at("07:06"), model);
    expect(r).toMatchObject({ output: "Готово.", tokens: 15, delivered: false });
  });

  it("does not hide why it failed", async () => {
    await expect(runAgentNow(tired, wsTired, "morning_briefing", at("07:07"), broken)).rejects.toThrow("the model is down");
  });
});
