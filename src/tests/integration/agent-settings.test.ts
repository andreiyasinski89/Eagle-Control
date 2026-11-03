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
import { agentSettingsSchema, getAgentSettings, saveAgentSettings } from "@/server/services/crm/agent-settings";
import { DEFAULT_AGENT_SETTINGS, cleanAgentSettings } from "@/modules/crm/agent-settings";
import { agentRunInput } from "../../../agent/settings-vars";
import { runAgent } from "../../../agent/run";
import type { AgentModel } from "../../../agent/model";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let colleague: string;
let ws: { id: string };

const model: AgentModel = {
  async complete() {
    return { content: [{ type: "text", text: "ok" }], stopReason: "end_turn", inputTokens: 10, outputTokens: 5, model: "scripted" };
  },
};
const mine = { enabled: true, briefingTime: "07:30", touchesPerDay: 25, meetingsPerDay: 5, goal: "статус Gold", deadline: "2026-11-08", dailyRunLimit: 3 };

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Андрей Ясинский", timezone: "Europe/Warsaw" } })).id;
  colleague = (await t.db.user.create({ data: { email: "c@x.io", name: "Colleague" } })).id;
  ws = await createWorkspace(owner, "MWR");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  await t.db.membership.create({ data: { userId: colleague, workspaceId: ws.id, role: "MEMBER", crmAccess: true } });
}, 120_000);
afterAll(async () => close?.());

describe("Agent settings", () => {
  it("start with the agent off and the norms the plan assumes", async () => {
    expect(await getAgentSettings(owner, ws.id)).toEqual(DEFAULT_AGENT_SETTINGS);
    expect(DEFAULT_AGENT_SETTINGS).toMatchObject({ enabled: false, briefingTime: "08:00", touchesPerDay: 20, meetingsPerDay: 4 });
  });

  it("are saved per person, and a colleague keeps their own", async () => {
    expect(await saveAgentSettings(owner, ws.id, agentSettingsSchema.parse(mine))).toEqual(mine);
    expect(await getAgentSettings(owner, ws.id)).toEqual(mine);
    expect(await getAgentSettings(colleague, ws.id)).toEqual(DEFAULT_AGENT_SETTINGS);
  });

  it("refuse nonsense at the door and repair damaged stored values", () => {
    expect(() => agentSettingsSchema.parse({ ...mine, briefingTime: "25:99" })).toThrow();
    expect(() => agentSettingsSchema.parse({ ...mine, touchesPerDay: 0 })).toThrow();
    expect(() => agentSettingsSchema.parse({ ...mine, deadline: "8 ноября" })).toThrow();
    expect(cleanAgentSettings({ enabled: "yes", briefingTime: "9:00", touchesPerDay: 9999, meetingsPerDay: -3, deadline: "2026-13-45", goal: 7 })).toEqual({ ...DEFAULT_AGENT_SETTINGS, touchesPerDay: 200, meetingsPerDay: 0 });
  });

  it("refuse someone outside the workspace", async () => {
    const stranger = (await raw.user.create({ data: { email: "s@x.io" } })).id;
    await expect(getAgentSettings(stranger, ws.id)).rejects.toMatchObject({ status: 404 });
    await expect(saveAgentSettings(stranger, ws.id, agentSettingsSchema.parse(mine))).rejects.toMatchObject({ status: 404 });
  });
});

describe("A run built from the settings", () => {
  it("fills the prompt variables and the deadline date, in the person's own day", async () => {
    const r = await agentRunInput(owner, ws.id, new Date("2026-11-03T23:30:00Z")); // already the 4th in Warsaw
    expect(r.vars).toEqual({ user_name: "Андрей", goal: "статус Gold", deadline: "08.11.2026", touches_per_day: 25, meetings_per_day: 5, date: "2026-11-04" });
    expect(r.deadlineDate).toBe("2026-11-08");
    const other = await agentRunInput(colleague, ws.id);
    expect(other.vars).toMatchObject({ goal: "не задана", deadline: "не задан", touches_per_day: 20, meetings_per_day: 4 });
    expect(other.deadlineDate).toBeUndefined();
  });
});

describe("Limits of a run", () => {
  it("refuses a workspace on a plan without AI, before any model call", async () => {
    const free = await createWorkspace(owner, "Free");
    await raw.workspace.update({ where: { id: free.id }, data: { plan: "FREE" } });
    const { vars } = await agentRunInput(owner, ws.id);
    await expect(runAgent({ userId: owner, workspaceId: free.id, role: "evening_report", vars, model })).rejects.toMatchObject({ status: 402 });
    expect(await raw.agentRun.count({ where: { workspaceId: free.id } })).toBe(0);
  });

  it("refuses when this month's allowance is spent", async () => {
    const spent = await createWorkspace(owner, "Spent");
    await raw.workspace.update({ where: { id: spent.id }, data: { plan: "PRO" } });
    await raw.aiUsage.create({ data: { workspaceId: spent.id, userId: owner, feature: "ask", model: "m", inputTokens: 1_000_000, outputTokens: 0 } });
    const { vars } = await agentRunInput(owner, ws.id);
    await expect(runAgent({ userId: owner, workspaceId: spent.id, role: "evening_report", vars, model })).rejects.toMatchObject({ status: 402, code: "ai_quota" });
  });

  it("stops at the person's daily limit and says so, and a colleague has their own", async () => {
    const { vars, deadlineDate } = await agentRunInput(owner, ws.id);
    for (let i = 0; i < 3; i++) await runAgent({ userId: owner, workspaceId: ws.id, role: "evening_report", vars, ...(deadlineDate ? { deadlineDate } : {}), model });
    await expect(runAgent({ userId: owner, workspaceId: ws.id, role: "evening_report", vars, model })).rejects.toMatchObject({ status: 429, code: "agent_daily_limit" });
    expect(await raw.agentRun.count({ where: { userId: owner, workspaceId: ws.id } })).toBe(3);

    const theirs = await agentRunInput(colleague, ws.id);
    await expect(runAgent({ userId: colleague, workspaceId: ws.id, role: "evening_report", vars: theirs.vars, model })).resolves.toMatchObject({ output: "ok" });
  });
});
