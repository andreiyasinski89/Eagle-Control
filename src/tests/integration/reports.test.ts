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
import { completeNode, createNode, createProject, patchNode, transact } from "@/server/services/nodes/ops";
import { getTree } from "@/server/services/nodes/queries";
import { createDeal, loseDeal, moveDeal, winDeal } from "@/server/services/crm/deals";
import { listLostReasons, listPipelines } from "@/server/services/crm/pipelines";
import { createActivity } from "@/server/services/crm/activities";
import { metricsQuerySchema, projectMetrics } from "@/server/services/metrics";
import { crmReport, crmReportCsv, crmReportQuerySchema } from "@/server/services/crm/reports";

let close: () => Promise<void>;
let owner: string;
let plain: string;
let client: string;
let free: { id: string; ownerId: string };
let ws: { id: string; slug: string };
let projectId: string;
const mq = (over: Record<string, string> = {}) => metricsQuerySchema.parse(over);
const rq = (over: Record<string, string> = {}) => crmReportQuerySchema.parse({ from: "2026-01-01", to: "2026-12-31", ...over });

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://x";
  process.env.AUTH_SECRET ??= "x";
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  plain = (await t.db.user.create({ data: { email: "m@x.io", name: "Plain" } })).id;
  client = (await t.db.user.create({ data: { email: "c@x.io", name: "Client" } })).id;
  ws = await createWorkspace(owner, "Pro Co");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  await t.db.membership.create({ data: { userId: plain, workspaceId: ws.id, role: "MEMBER", crmAccess: false } });
  await t.db.membership.create({ data: { userId: client, workspaceId: ws.id, role: "CLIENT" } });
  const freeWs = await createWorkspace(owner, "Free Co");
  free = { id: freeWs.id, ownerId: owner };

  const { project } = await createProject(owner, ws.id, { name: "Delivery", template: "agile-sprint-map" });
  projectId = project.id;
  const sprint = (await getTree(owner, projectId)).nodes.find((n) => n.type === "SPRINT")!;
  await transact(owner, (ctx) => patchNode(ctx, sprint.id, { startDate: "2026-10-12T00:00:00.000Z", dueDate: "2026-10-25T00:00:00.000Z" }));
  const mk = async (title: string, estimation: number) => (await transact(owner, (ctx) => createNode(ctx, { parentId: sprint.id, type: "TASK", title, estimation }))).result.id;
  const a = await mk("A", 5);
  const b = await mk("B", 3);
  await mk("C", 2);
  await transact(owner, (ctx) => patchNode(ctx, a, { status: "IN_PROGRESS" }));
  await transact(owner, (ctx) => completeNode(ctx, a));
  await transact(owner, (ctx) => patchNode(ctx, b, { status: "IN_PROGRESS" }));

  const pipelines = await listPipelines(owner, ws.id);
  const stages = pipelines[0]!.stages;
  const reasons = await listLostReasons(owner, ws.id);
  const d1 = await createDeal(owner, ws.id, { title: "Won one", amount: 1000, currency: "EUR", ownerId: owner, source: "web" });
  await moveDeal(owner, d1.id, { stageId: stages[1]!.id });
  await winDeal(owner, d1.id);
  const d2 = await createDeal(owner, ws.id, { title: "Lost one", amount: 400, currency: "EUR", ownerId: owner, source: "ads" });
  await loseDeal(owner, d2.id, reasons[0]!.id);
  await createDeal(owner, ws.id, { title: "Open one", amount: 2000, currency: "EUR", ownerId: owner, source: "web", expectedCloseDate: "2026-11-20T00:00:00.000Z" });
  await createActivity(owner, ws.id, { type: "CALL", subject: "Call", dealId: d1.id, completed: true });
}, 120_000);
afterAll(async () => close?.());

describe("agile metrics", () => {
  it("replays real history into velocity, flow, cycle time and throughput", async () => {
    const m = await projectMetrics(owner, projectId, mq(), new Date("2026-10-26T12:00:00Z"));
    const sprint = m.velocity.sprints.find((s) => s.committed === 10)!;
    expect(sprint).toMatchObject({ committed: 10, completed: 0, finished: true }); // A was completed today, after the sprint ended
    expect(m.taskCount).toBe(3);
    const today = m.flow[m.flow.length - 1]!;
    expect(today.date).toBe("2026-10-26");
    expect(m.burndowns.length).toBeGreaterThan(0);
    expect(m.cycle).toHaveProperty("histogram");
    expect(m.throughput).toHaveLength(12);
  });

  it("counts work finished inside the sprint as velocity", async () => {
    const sprint = (await getTree(owner, projectId)).nodes.find((n) => n.type === "SPRINT")!;
    await transact(owner, (ctx) => patchNode(ctx, sprint.id, { dueDate: "2099-01-01T00:00:00.000Z" }));
    const row = (await projectMetrics(owner, projectId, mq())).velocity.sprints.find((s) => s.committed === 10)!;
    expect(row).toMatchObject({ completed: 5, finished: false });
  });

  it("is a Pro feature, hidden from clients and from strangers", async () => {
    const t = holder.db;
    const { project } = await createProject(free.ownerId, free.id, { name: "On free" });
    await expect(projectMetrics(owner, project.id, mq())).rejects.toMatchObject({ status: 402, code: "plan_feature", details: { feature: "metrics" } });
    await t.projectMember.create({ data: { nodeId: projectId, userId: client, visibleToClientOnly: true } });
    await expect(projectMetrics(client, projectId, mq())).rejects.toMatchObject({ status: 403 });
    await expect(projectMetrics("nobody", projectId, mq())).rejects.toMatchObject({ status: 404 });
  });
});

describe("CRM reports", () => {
  it("summarises the funnel, forecast, outcomes, sources and managers", async () => {
    const r = await crmReport(owner, ws.id, rq());
    expect(r.funnel.rows[0]!.reached).toBe(3);
    expect(r.funnel.lost).toBe(1);
    expect(r.winLoss).toMatchObject({ won: 1, lost: 1, winRate: 0.5, wonAmount: { EUR: 1000 } });
    expect(r.forecast.EUR!.map((x) => x.month)).toEqual(["2026-11"]);
    expect(r.forecast.EUR![0]).toMatchObject({ count: 1, total: 2000 });
    expect(r.sources.find((s) => s.source === "web")).toMatchObject({ deals: 2, won: 1, conversion: 0.5 });
    expect(r.managers[0]).toMatchObject({ name: "Owner", dealsWon: 1, calls: 1 });
  });

  it("exports sections as CSV and keeps the period honest", async () => {
    const r = await crmReport(owner, ws.id, rq({ format: "csv", section: "sources" }));
    expect(crmReportCsv(r, "sources")).toContain("Source,Deals,Won,Conversion,Won amount");
    expect(crmReportCsv(r, "winloss")).toContain("Win rate,50%");
    await expect(crmReport(owner, ws.id, rq({ from: "2026-12-31", to: "2026-01-01" }))).rejects.toMatchObject({ code: "invalid_period" });
    await expect(crmReport(owner, ws.id, rq({ from: "2020-01-01", to: "2026-12-31" }))).rejects.toMatchObject({ code: "period_too_long" });
    expect((await crmReport(owner, ws.id, rq({ from: "2020-01-01", to: "2020-01-31" }))).winLoss.won).toBe(0);
  });

  it("needs CRM access and the Pro plan", async () => {
    await expect(crmReport(plain, ws.id, rq())).rejects.toMatchObject({ status: 403 });
    await expect(crmReport(owner, free.id, rq())).rejects.toMatchObject({ status: 402, code: "plan_feature" });
    await holder.db.membership.update({ where: { userId_workspaceId: { userId: plain, workspaceId: ws.id } }, data: { crmAccess: true } });
    expect((await crmReport(plain, ws.id, rq({ format: "csv" }))).winLoss.won).toBe(1); // a member with CRM access may read and export
    expect((await crmReport(plain, ws.id, rq())).winLoss.won).toBe(1);
  });
});
