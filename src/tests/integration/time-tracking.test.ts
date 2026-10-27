import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn(async () => undefined) }));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { createNode, createProject, transact } from "@/server/services/nodes/ops";
import { getTree } from "@/server/services/nodes/queries";
import { addEntry, currentTimer, startTimer, startTimerSchema, stopTimer, summarySchema, timeSummary, timesheet } from "@/server/services/time";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let warsaw: string;
let outsider: string;
let ws: { id: string };
let other: { id: string };
let task: string;
const at = (s: string) => new Date(`${s}Z`);
const sum = (userId: string, q: Record<string, string>, now: string) => timeSummary(userId, ws.id, summarySchema.parse(q), at(now));

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://x";
  process.env.AUTH_SECRET ??= "x";
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  warsaw = (await t.db.user.create({ data: { email: "w@x.io", name: "Wanda", timezone: "Europe/Warsaw" } })).id;
  outsider = (await t.db.user.create({ data: { email: "z@x.io", name: "Zed" } })).id;
  ws = await createWorkspace(owner, "Acme");
  other = await createWorkspace(outsider, "Other");
  await t.db.membership.create({ data: { userId: warsaw, workspaceId: ws.id, role: "MEMBER" } });
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  const { project } = await createProject(owner, ws.id, { name: "Work", template: "agile-sprint-map" });
  const sprint = (await getTree(owner, project.id)).nodes.find((n) => n.type === "SPRINT")!;
  task = (await transact(owner, (ctx) => createNode(ctx, { parentId: sprint.id, type: "TASK", title: "Build" }))).result.id;
}, 120_000);
afterAll(async () => close?.());

describe("a timer with no task", () => {
  it("starts on a label, runs until stopped, and writes the time to the person's own day", async () => {
    expect(startTimerSchema.safeParse({}).success).toBe(false);
    const s = await startTimer(owner, { workspaceId: ws.id, label: "Calls to the list" }, at("2026-10-27T09:00:00"));
    expect(s.timer).toMatchObject({ nodeId: null, title: "Calls to the list", label: "Calls to the list", slug: expect.any(String) });
    expect((await currentTimer(holder.db, owner, at("2026-10-27T09:20:00")))?.seconds).toBe(1200);
    const stop = await stopTimer(owner, at("2026-10-27T10:30:00"));
    expect(stop.entry).toMatchObject({ nodeId: null, label: "Calls to the list", minutes: 90, date: "2026-10-27" });
    expect(await currentTimer(holder.db, owner)).toBeNull();
  });

  it("is for members of the workspace only, and a task timer says its workspace", async () => {
    await expect(startTimer(outsider, { workspaceId: ws.id }, at("2026-10-27T09:00:00"))).rejects.toBeTruthy();
    await expect(startTimer(outsider, { nodeId: task }, at("2026-10-27T09:00:00"))).rejects.toBeTruthy();
    const s = await startTimer(owner, { nodeId: task }, at("2026-10-27T11:00:00"));
    expect(s.timer).toMatchObject({ nodeId: task, title: "Build", label: null });
    await startTimer(owner, { workspaceId: ws.id, label: "Reading" }, at("2026-10-27T11:20:00"));
    const rows = await raw.timeEntry.findMany({ where: { userId: owner, label: null }, select: { workspaceId: true, minutes: true, billable: true } });
    expect(rows).toEqual([{ workspaceId: ws.id, minutes: 20, billable: true }]);
    await stopTimer(owner, at("2026-10-27T11:20:10"));
    expect(await currentTimer(holder.db, owner)).toBeNull();
    expect(other.id).not.toBe(ws.id);
  });

  it("a timer of a few seconds records nothing", async () => {
    await startTimer(owner, { workspaceId: ws.id }, at("2026-10-27T12:00:00"));
    expect((await stopTimer(owner, at("2026-10-27T12:00:20"))).entries).toEqual([]);
  });
});

describe("days in the person's own time zone", () => {
  it("a timer left on over midnight counts on both days, by Warsaw's clock", async () => {
    // 22:30 to 00:30 in Warsaw (UTC+1 in winter)
    await startTimer(warsaw, { workspaceId: ws.id, label: "Late work" }, at("2026-11-10T21:30:00"));
    const stop = await stopTimer(warsaw, at("2026-11-10T23:30:00"));
    expect(stop.entries.map((e) => [e.date, e.minutes])).toEqual([["2026-11-10", 90], ["2026-11-11", 30]]);
  });

  it("never puts more than 24 hours on one day", async () => {
    await raw.timeEntry.create({ data: { workspaceId: ws.id, userId: warsaw, minutes: 1400, date: new Date("2026-11-20T00:00:00.000Z"), label: "Filler" } });
    await startTimer(warsaw, { workspaceId: ws.id }, at("2026-11-20T09:00:00"));
    const stop = await stopTimer(warsaw, at("2026-11-20T11:00:00"));
    expect(stop.entries.map((e) => e.minutes)).toEqual([40]);
  });
});

describe("totals by day, week, month and all time", () => {
  beforeAll(async () => {
    await raw.timeEntry.deleteMany({});
    // October 2026: Mon 26, Tue 27, Sun 1 Nov (next week and month); September: Mon 28
    await addEntry(owner, task, { minutes: 60, date: "2026-10-26", billable: true }, at("2026-10-30T12:00:00"));
    await addEntry(owner, task, { minutes: 120, date: "2026-10-27", billable: false, note: "api" }, at("2026-10-30T12:00:00"));
    await raw.timeEntry.createMany({ data: [{ workspaceId: ws.id, userId: owner, minutes: 45, date: new Date("2026-10-27T00:00:00.000Z"), label: "Calls", billable: false }, { workspaceId: ws.id, userId: owner, minutes: 30, date: new Date("2026-11-01T00:00:00.000Z"), label: "Calls" }, { workspaceId: ws.id, userId: owner, minutes: 90, date: new Date("2026-09-28T00:00:00.000Z"), label: "Calls" }, { workspaceId: ws.id, userId: warsaw, minutes: 500, date: new Date("2026-10-27T00:00:00.000Z"), label: "Not mine" }, { workspaceId: other.id, userId: owner, minutes: 700, date: new Date("2026-10-27T00:00:00.000Z"), label: "Other workspace" }] });
  });
  const NOW = "2026-10-27T14:00:00";

  it("gives the four totals of the header", async () => {
    const r = await sum(owner, { period: "day" }, NOW);
    expect(r.overview).toEqual({ today: 165, week: 255, month: 225, all: 345 });
    expect(r).toMatchObject({ today: "2026-10-27", totalMinutes: 165, from: "2026-10-27", to: "2026-10-27" });
  });

  it("a day: its entries, with and without a task", async () => {
    const r = await sum(owner, { period: "day" }, NOW);
    expect(r.entries.map((e) => [e.title, e.minutes, e.note])).toEqual(expect.arrayContaining([["Build", 120, "api"], ["Calls", 45, null]]));
    expect(r.items.map((i) => [i.title, i.minutes])).toEqual([["Build", 120], ["Calls", 45]]);
    expect(r.items[0]).toMatchObject({ projectTitle: "Work" });
    expect(r.billableMinutes).toBe(0);
  });

  it("a week: Monday to Sunday, every day listed, the zeros too", async () => {
    const r = await sum(owner, { period: "week", date: "2026-10-28" }, NOW);
    expect(r).toMatchObject({ from: "2026-10-26", to: "2026-11-01", totalMinutes: 255, billableMinutes: 60 });
    expect(r.series.map((s) => [s.key, s.minutes])).toEqual([["2026-10-26", 60], ["2026-10-27", 165], ["2026-10-28", 0], ["2026-10-29", 0], ["2026-10-30", 0], ["2026-10-31", 0], ["2026-11-01", 30]]);
  });

  it("a month, the month before, and all time by month", async () => {
    expect((await sum(owner, { period: "month" }, NOW)).totalMinutes).toBe(225);
    const sept = await sum(owner, { period: "month", date: "2026-09-15" }, NOW);
    expect(sept).toMatchObject({ totalMinutes: 90, from: "2026-09-01", to: "2026-09-30" });
    const all = await sum(owner, { period: "all" }, NOW);
    expect(all.totalMinutes).toBe(345);
    expect(all.series.map((s) => [s.key, s.minutes])).toEqual([["2026-11", 30], ["2026-10", 225], ["2026-09", 90]]);
    expect(all.entries).toEqual([]);
  });

  it("counts only the person's own time in this workspace, and is closed to strangers", async () => {
    expect((await sum(warsaw, { period: "month" }, NOW)).totalMinutes).toBe(500);
    await expect(timeSummary(outsider, ws.id, summarySchema.parse({}), at(NOW))).rejects.toBeTruthy();
  });

  it("the weekly sheet shows time with no task under its label", async () => {
    const sheet = await timesheet(owner, ws.id, at("2026-10-28T00:00:00"));
    expect(sheet.tasks.map((t) => [t.title, t.nodeId === null ? "label" : "task", t.total])).toEqual([["Build", "task", 180], ["Calls", "label", 75]]);
  });
});
