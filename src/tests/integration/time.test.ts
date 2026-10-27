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
import { createCompany } from "@/server/services/crm/companies";
import { createDeal, createProjectFromDeal, winDeal } from "@/server/services/crm/deals";
import { updateMember } from "@/server/services/membership";
import { addEntry, clientTimeReport, currentTimer, deleteEntry, listEntries, startTimer, stopTimer, timeReportCsv, timesheet, updateEntry } from "@/server/services/time";

let close: () => Promise<void>;
let owner: string;
let member: string;
let outsider: string;
let ws: { id: string; slug: string };
let task: string;
let projectId: string;
const at = (s: string) => new Date(`${s}Z`);

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://x";
  process.env.AUTH_SECRET ??= "x";
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  member = (await t.db.user.create({ data: { email: "m@x.io", name: "Member" } })).id;
  outsider = (await t.db.user.create({ data: { email: "z@x.io", name: "Zed" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.membership.create({ data: { userId: member, workspaceId: ws.id, role: "MEMBER", crmAccess: true } });
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  const { project } = await createProject(owner, ws.id, { name: "Work", template: "agile-sprint-map" });
  projectId = project.id;
  const sprint = (await getTree(owner, project.id)).nodes.find((n) => n.type === "SPRINT")!;
  task = (await transact(owner, (ctx) => createNode(ctx, { parentId: sprint.id, type: "TASK", title: "Build" }))).result.id;
}, 120_000);
afterAll(async () => close?.());

describe("entries", () => {
  it("logs, lists, edits and deletes time on a task", async () => {
    const e = await addEntry(member, task, { minutes: 90, date: "2026-10-26", billable: true, note: "api" }, at("2026-10-26T12:00:00"));
    expect(e).toMatchObject({ minutes: 90, date: "2026-10-26", userName: "Member" });
    expect((await listEntries(owner, task)).map((x) => x.minutes)).toEqual([90]);
    expect((await updateEntry(member, e.id, { minutes: 60, billable: false })).minutes).toBe(60);
    await deleteEntry(member, e.id);
    expect(await listEntries(owner, task)).toEqual([]);
  });

  it("only the author or an admin may change an entry; strangers cannot see the task", async () => {
    const e = await addEntry(member, task, { minutes: 30, date: "2026-10-26", billable: true }, at("2026-10-26T12:00:00"));
    await expect(addEntry(outsider, task, { minutes: 5, date: "2026-10-26", billable: true })).rejects.toMatchObject({ status: 404 });
    const peer = (await holder.db.user.create({ data: { email: "p@x.io" } })).id;
    await holder.db.membership.create({ data: { userId: peer, workspaceId: ws.id, role: "MEMBER" } });
    await expect(deleteEntry(peer, e.id)).rejects.toMatchObject({ status: 403 });
    expect((await updateEntry(owner, e.id, { minutes: 45 })).minutes).toBe(45);
  });

  it("refuses non-tasks, the future and more than 24 hours a day", async () => {
    await expect(addEntry(owner, projectId, { minutes: 5, date: "2026-10-26", billable: true })).rejects.toMatchObject({ code: "not_trackable" });
    await expect(addEntry(owner, task, { minutes: 5, date: "2027-01-01", billable: true }, at("2026-10-26T12:00:00"))).rejects.toMatchObject({ code: "future_date" });
    await addEntry(owner, task, { minutes: 1400, date: "2026-10-20", billable: true }, at("2026-10-26T12:00:00"));
    await expect(addEntry(owner, task, { minutes: 100, date: "2026-10-20", billable: true }, at("2026-10-26T12:00:00"))).rejects.toMatchObject({ code: "day_overflow" });
  });
});

describe("timer", () => {
  it("runs one timer per person; starting another logs the first", async () => {
    const s = await startTimer(member, { nodeId: task }, at("2026-10-26T09:00:00"));
    expect(s.stopped).toBeNull();
    expect((await currentTimer(holder.db, member, at("2026-10-26T09:10:00")))?.seconds).toBe(600);
    const sprint = (await getTree(owner, projectId)).nodes.find((n) => n.type === "SPRINT")!;
    const other = (await transact(owner, (ctx) => createNode(ctx, { parentId: sprint.id, type: "TASK", title: "Other" }))).result.id;
    const s2 = await startTimer(member, { nodeId: other }, at("2026-10-26T09:30:00"));
    expect(s2.stopped).toMatchObject({ nodeId: task, minutes: 30 });
    const stop = await stopTimer(member, at("2026-10-26T09:30:10"));
    expect(stop.entry).toBeNull();
    expect(await currentTimer(holder.db, member)).toBeNull();
  });
});

describe("timesheet", () => {
  it("sums one person's week by task and day", async () => {
    await holder.db.timeEntry.deleteMany({});
    await addEntry(member, task, { minutes: 60, date: "2026-10-26", billable: true }, at("2026-10-30T12:00:00"));
    await addEntry(member, task, { minutes: 30, date: "2026-10-28", billable: false }, at("2026-10-30T12:00:00"));
    await addEntry(owner, task, { minutes: 500, date: "2026-10-28", billable: true }, at("2026-10-30T12:00:00"));
    const sheet = await timesheet(member, ws.id, at("2026-10-29T00:00:00"));
    expect(sheet.weekStart).toBe("2026-10-26");
    expect(sheet.totalMinutes).toBe(90);
    expect(sheet.billableMinutes).toBe(60);
    expect(sheet.perDay["2026-10-28"]).toBe(30);
    expect(sheet.tasks).toHaveLength(1);
    expect(sheet.tasks[0]).toMatchObject({ title: "Build", total: 90, projectTitle: "Work" });
  });
});

describe("client report", () => {
  it("adds up a client's projects, with money for admins only", async () => {
    await holder.db.timeEntry.deleteMany({});
    const company = await createCompany(owner, ws.id, { legalName: "Client Co", allowDuplicate: true });
    const deal = await createDeal(owner, ws.id, { title: "Site", amount: 1000, currency: "EUR", companyId: company.id });
    await winDeal(owner, deal.id);
    const proj = await createProjectFromDeal(owner, deal.id, { template: "agile-sprint-map" });
    const sprint = (await getTree(owner, proj.project.id)).nodes.find((n) => n.type === "SPRINT")!;
    const t1 = (await transact(owner, (ctx) => createNode(ctx, { parentId: sprint.id, type: "TASK", title: "Design" }))).result.id;
    await updateMember({ userId: owner, role: "OWNER" }, ws.id, member, { hourlyRate: 50 });
    await addEntry(member, t1, { minutes: 120, date: "2026-10-26", billable: true }, at("2026-10-30T12:00:00"));
    await addEntry(member, t1, { minutes: 60, date: "2026-10-27", billable: false }, at("2026-10-30T12:00:00"));
    await addEntry(member, task, { minutes: 999, date: "2026-10-27", billable: true }, at("2026-10-30T12:00:00"));

    const q = { from: "2026-10-01", to: "2026-10-31", currency: "EUR", format: "json" as const };
    const adminView = await clientTimeReport(owner, company.id, q);
    expect(adminView.totals).toEqual({ minutes: 180, billableMinutes: 120, amount: 100 });
    expect(adminView.byMember[0]).toMatchObject({ name: "Member", minutes: 180, amount: 100 });
    expect(timeReportCsv(adminView)).toContain("Amount (EUR)");

    const memberView = await clientTimeReport(member, company.id, q);
    expect(memberView.totals).toEqual({ minutes: 180, billableMinutes: 120, amount: null });
    expect(memberView.showMoney).toBe(false);
    expect(timeReportCsv(memberView)).not.toContain("Amount");

    await holder.db.node.update({ where: { id: proj.project.id }, data: { data: { hourlyRate: 80 } } });
    expect((await clientTimeReport(owner, company.id, q)).totals.amount).toBe(160);
    await expect(clientTimeReport(owner, company.id, { ...q, to: "2025-01-01" })).rejects.toMatchObject({ code: "invalid_period" });
    await expect(clientTimeReport(outsider, company.id, q)).rejects.toBeTruthy();
  });
});
