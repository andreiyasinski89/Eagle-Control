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
import { createNode, createProject, patchNode, transact } from "@/server/services/nodes/ops";
import { getMyDay } from "@/server/services/crm/my-day";
import { closeDay, closeYesterdays, getDayHistory, recordDayScore } from "@/server/services/crm/day-history";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let other: string;
let ws: { id: string };
let projectId: string;

// 2026-11-04, noon: a Wednesday, the person's day in UTC.
const NOW = new Date("2026-11-04T12:00:00.000Z");
const DAY = 86_400_000;
const plan = (over: Partial<{ tp: number; td: number; mp: number; md: number; fp: number; fd: number; bo: number; bc: number; e: number | null; p: number | null }> = {}) => ({
  tasks: { planned: over.tp ?? 2, done: over.td ?? 1 },
  meetings: { planned: over.mp ?? 0, done: over.md ?? 0 },
  followUps: { planned: over.fp ?? 0, done: over.fd ?? 0 },
  backlogOpen: over.bo ?? 0,
  backlogCleared: over.bc ?? 0,
  trackedMinutes: 30,
  efficiency: over.e === undefined ? 50 : over.e,
  productivity: over.p === undefined ? 50 : over.p,
});
const rows = (userId = owner) => raw.dayScore.findMany({ where: { userId, workspaceId: ws.id }, orderBy: { day: "asc" } });
const dayStr = (r: { day: Date }) => r.day.toISOString().slice(0, 10);
let epicId = "";
const task = async (title: string, due: string, status: "TODO" | "DONE" = "TODO") => {
  epicId ||= (await transact(owner, (ctx) => createNode(ctx, { parentId: projectId, type: "EPIC", title: "Goal" }))).result.id;
  const n = (await transact(owner, (ctx) => createNode(ctx, { parentId: epicId, type: "TASK", title }))).result;
  await transact(owner, (ctx) => patchNode(ctx, n.id, { assigneeId: owner, dueDate: `${due}T00:00:00.000Z`, status }));
  return n.id;
};

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner", timezone: "UTC" } })).id;
  other = (await t.db.user.create({ data: { email: "p@x.io", name: "Other", timezone: "UTC" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  await t.db.membership.create({ data: { userId: other, workspaceId: ws.id, role: "MEMBER", crmAccess: true, crmScope: "OWN" } });
  projectId = (await createProject(owner, ws.id, { name: "Launch", template: "empty", estimationUnit: "HOURS" })).project.id;
}, 120_000);
afterAll(async () => close?.());

describe("keeping a day", () => {
  it("keeps nothing for a day that wanted nothing from the person", async () => {
    await recordDayScore(owner, ws.id, "2026-10-01", plan({ tp: 0, td: 0, e: null, p: null }));
    expect(await rows()).toHaveLength(0);
  });

  it("saves the numbers of a day and updates them while the day goes on", async () => {
    await recordDayScore(owner, ws.id, "2026-10-02", plan());
    await recordDayScore(owner, ws.id, "2026-10-02", plan({ td: 2, e: 100, p: 100 }));
    const r = (await rows()).filter((x) => dayStr(x) === "2026-10-02");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tasksPlanned: 2, tasksDone: 2, efficiency: 100, productivity: 100, closed: false });
  });

  it("does not let a later look change a closed day, and lets the closing change it", async () => {
    await recordDayScore(owner, ws.id, "2026-10-03", plan({ e: 10, p: 10 }), true);
    await recordDayScore(owner, ws.id, "2026-10-03", plan({ e: 90, p: 90 }));
    expect((await rows()).find((x) => dayStr(x) === "2026-10-03")).toMatchObject({ efficiency: 10, closed: true });
    await recordDayScore(owner, ws.id, "2026-10-03", plan({ e: 20, p: 20 }), true);
    expect((await rows()).find((x) => dayStr(x) === "2026-10-03")?.efficiency).toBe(20);
  });
});

describe("looking at My day saves the day", () => {
  it("writes today's row from the plan, and the next look updates it", async () => {
    const t1 = await task("Due today A", "2026-11-04");
    await task("Due today B", "2026-11-04");
    await getMyDay(owner, ws.id, NOW);
    let today = (await rows()).find((x) => dayStr(x) === "2026-11-04");
    expect(today).toMatchObject({ tasksPlanned: 2, tasksDone: 0, efficiency: 0, closed: false });
    await transact(owner, (ctx) => patchNode(ctx, t1, { status: "DONE" }));
    await getMyDay(owner, ws.id, NOW);
    today = (await rows()).find((x) => dayStr(x) === "2026-11-04");
    expect(today).toMatchObject({ tasksPlanned: 2, tasksDone: 1, efficiency: 50 });
  });
});

describe("closing a day", () => {
  it("works a finished day out as it stood at its end and keeps it as final", async () => {
    await task("Due yesterday", "2026-11-03");
    await closeDay(owner, ws.id, "2026-11-03", "UTC");
    const y = (await rows()).find((x) => dayStr(x) === "2026-11-03");
    expect(y).toMatchObject({ tasksPlanned: 1, tasksDone: 0, efficiency: 0, closed: true });
    // a second closing leaves it alone
    await raw.dayScore.update({ where: { id: y!.id }, data: { efficiency: 77 } });
    await closeDay(owner, ws.id, "2026-11-03", "UTC");
    expect((await rows()).find((x) => dayStr(x) === "2026-11-03")?.efficiency).toBe(77);
  });

  it("is done by the nightly job for those who worked with the plan lately, and only for them", async () => {
    await task("Due on the 4th, still open", "2026-11-04");
    await raw.dayScore.deleteMany({ where: { userId: owner, day: new Date("2026-11-04T00:00:00Z") } });
    await recordDayScore(owner, ws.id, "2026-11-04", plan());
    const r = await closeYesterdays(new Date("2026-11-05T03:50:00Z"));
    expect(r.failed).toBe(0);
    expect(r.checked).toBeGreaterThanOrEqual(1);
    expect((await rows()).find((x) => dayStr(x) === "2026-11-04")?.closed).toBe(true);
    expect(await rows(other)).toHaveLength(0);
  });
});

describe("the history", () => {
  beforeAll(async () => {
    await raw.dayScore.deleteMany({});
    // 60 days back from NOW: the efficiency climbs with the days, the productivity is half of it; every tenth day is missing.
    const data = Array.from({ length: 60 }, (_, i) => i)
      .filter((i) => i % 10 !== 5)
      .map((i) => {
        const d = new Date(NOW.getTime() - i * DAY);
        const eff = 100 - i; // older days are worse
        return { userId: owner, workspaceId: ws.id, day: new Date(`${d.toISOString().slice(0, 10)}T00:00:00Z`), tasksPlanned: 4, tasksDone: 2, efficiency: eff, productivity: Math.round(eff / 2), closed: true };
      });
    await raw.dayScore.createMany({ data });
  });

  it("gives yesterday and today side by side", async () => {
    const h = await getDayHistory(owner, ws.id, { period: "yesterday" }, NOW);
    expect(h.yesterday).toMatchObject({ day: "2026-11-03", efficiency: 99 });
    expect(h.todayRow).toMatchObject({ day: "2026-11-04", efficiency: 100 });
  });

  it("gives this week by days, with the average and the week before to compare", async () => {
    const h = await getDayHistory(owner, ws.id, { period: "week" }, NOW);
    expect(h.points.map((p) => p.from)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
    expect(h.average).toMatchObject({ efficiency: 99, days: 3 });
    expect(h.previous?.days).toBe(6); // the week before has one missing day
    expect(h.trend.efficiency).toBe("up");
  });

  it("gives 30 days with the gaps left empty, and the 30 before for comparison", async () => {
    const h = await getDayHistory(owner, ws.id, { period: "30d" }, NOW);
    expect(h.points).toHaveLength(30);
    expect(h.points.filter((p) => p.days === 0).length).toBe(3); // days 5, 15, 25 back
    expect(h.average.days).toBe(27);
    expect(h.previous?.days).toBeGreaterThan(0);
    expect(h.days).toHaveLength(27);
  });

  it("gives a year and everything by weeks", async () => {
    const y = await getDayHistory(owner, ws.id, { period: "year" }, NOW);
    expect(y.range.bucket).toBe("week");
    expect(y.points.length).toBeGreaterThan(8);
    expect(y.days).toEqual([]);
    const all = await getDayHistory(owner, ws.id, { period: "all" }, NOW);
    expect(all.since).toBe("2026-09-06");
    expect(all.savedDays).toBe(54);
    expect(all.previous).toBeNull();
    expect(all.range.bucket).toBe("day"); // 59 days: still by days
  });

  it("shows a person only their own days", async () => {
    const h = await getDayHistory(other, ws.id, { period: "30d" }, NOW);
    expect(h.average.days).toBe(0);
    expect(h.savedDays).toBe(0);
    expect(h.points.every((p) => p.days === 0)).toBe(true);
  });
});
