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
import { createLink, createNode, createProject, patchNode, transact } from "@/server/services/nodes/ops";
import { getTree } from "@/server/services/nodes/queries";
import { createDeal } from "@/server/services/crm/deals";
import { createActivity } from "@/server/services/crm/activities";
import { calendarQuerySchema, projectBlockLinks, workspaceCalendar } from "@/server/services/nodes/views";

let close: () => Promise<void>;
let owner: string;
let plain: string;
let stranger: string;
let ws: { id: string; slug: string };
let projectId: string;
let a: string;
let b: string;
const q = (over: Record<string, string> = {}) => calendarQuerySchema.parse({ from: "2026-10-01", to: "2026-10-31", ...over });

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://x";
  process.env.AUTH_SECRET ??= "x";
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  plain = (await t.db.user.create({ data: { email: "m@x.io", name: "Plain" } })).id;
  stranger = (await t.db.user.create({ data: { email: "s@x.io" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.membership.create({ data: { userId: plain, workspaceId: ws.id, role: "MEMBER", crmAccess: false } });
  const { project } = await createProject(owner, ws.id, { name: "Site", template: "agile-sprint-map" });
  projectId = project.id;
  const sprint = (await getTree(owner, projectId)).nodes.find((n) => n.type === "SPRINT")!;
  const mk = async (title: string, dueDate: string, assigneeId?: string) => (await transact(owner, (ctx) => createNode(ctx, { parentId: sprint.id, type: "TASK", title, dueDate, assigneeId }))).result.id;
  a = await mk("Design", "2026-10-12T00:00:00.000Z", owner);
  b = await mk("Build", "2026-10-20T00:00:00.000Z", plain);
  await mk("Out of window", "2026-12-01T00:00:00.000Z", owner);
  await transact(owner, (ctx) => createLink(ctx, { fromNodeId: a, toNodeId: b, kind: "BLOCKS" }));
  const event = (await transact(owner, (ctx) => createNode(ctx, { parentId: sprint.id, type: "EVENT", title: "Kickoff" }))).result.id;
  await transact(owner, (ctx) => patchNode(ctx, event, { data: { startsAt: "2026-10-15T09:30:00.000Z", attendeeIds: [owner] } }));
  const deal = await createDeal(owner, ws.id, { title: "Big deal", amount: 10, currency: "EUR", ownerId: owner, nextStep: "Send proposal", nextStepAt: "2026-10-14T00:00:00.000Z", expectedCloseDate: "2026-10-28T00:00:00.000Z" });
  await createActivity(owner, ws.id, { type: "CALL", subject: "Call Anna", dueAt: "2026-10-16T10:00:00.000Z", dealId: deal.id });
}, 120_000);
afterAll(async () => close?.());

describe("project block links", () => {
  it("returns dependencies inside the project and nothing to strangers", async () => {
    const { items } = await projectBlockLinks(plain, projectId);
    expect(items.map((l) => [l.fromNodeId, l.toNodeId])).toEqual([[a, b]]);
    await expect(projectBlockLinks(stranger, projectId)).rejects.toMatchObject({ status: 404 });
  });
});

describe("workspace calendar", () => {
  it("shows everything dated in the window, soonest first, Agile and CRM together", async () => {
    const { items } = await workspaceCalendar(owner, ws.id, q());
    expect(items.map((i) => `${i.kind}:${i.title}`)).toEqual(["task:Design", "deal_step:Send proposal", "event:Kickoff", "crm_activity:Call Anna", "task:Build", "deal_close:Big deal"]);
    expect(items.find((i) => i.kind === "task")!.context).toBe("Site");
    expect(items.every((i) => i.href.startsWith("/"))).toBe(true);
  });

  it("can be limited to my own items", async () => {
    const { items } = await workspaceCalendar(owner, ws.id, q({ mine: "1" }));
    expect(items.map((i) => i.title)).not.toContain("Build"); // assigned to someone else
    expect(items.map((i) => i.title)).toContain("Design");
  });

  it("keeps CRM items from people without CRM access and rejects strangers and silly windows", async () => {
    const { items } = await workspaceCalendar(plain, ws.id, q());
    expect(items.map((i) => i.kind).sort()).toEqual(["event", "task", "task"]);
    await expect(workspaceCalendar(stranger, ws.id, q())).rejects.toBeTruthy();
    expect(() => q({ from: "2026-01-01", to: "2026-12-31" })).toThrow();
    expect(() => q({ from: "2026-10-31", to: "2026-10-01" })).toThrow();
  });

  it("includes the last day of the window", async () => {
    const t = (await getTree(owner, projectId)).nodes.find((n) => n.type === "SPRINT")!;
    await transact(owner, (ctx) => createNode(ctx, { parentId: t.id, type: "TASK", title: "Last day", dueDate: "2026-10-31T00:00:00.000Z" }));
    expect((await workspaceCalendar(owner, ws.id, q())).items.map((i) => i.title)).toContain("Last day");
  });
});
