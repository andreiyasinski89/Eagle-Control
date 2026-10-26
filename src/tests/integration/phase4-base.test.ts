import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
const sendMail = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/server/mail", () => ({ sendMail }));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { archiveNode, completeNode, createNode, createProject, patchNode, transact } from "@/server/services/nodes/ops";
import { runBatch } from "@/server/services/nodes/batch";
import { getTree } from "@/server/services/nodes/queries";
import { createComment } from "@/server/services/comments";
import { createDeal, loseDeal, moveDeal, winDeal } from "@/server/services/crm/deals";
import { listLostReasons, listPipelines } from "@/server/services/crm/pipelines";
import { createContact } from "@/server/services/crm/contacts";
import { createActivity } from "@/server/services/crm/activities";
import { deliverPending, getPreferences, listNotifications, markRead, notify, setPreference } from "@/server/services/notify";
import { dispatchReminders, maintenance, refreshAllProjects } from "@/server/jobs/tasks";
import { enqueue, jobsMode } from "@/server/jobs";

let close: () => Promise<void>;
let owner: string;
let member: string;
let ws: { id: string; slug: string };
const DAY = 86_400_000;

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://x";
  process.env.AUTH_SECRET ??= "x";
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "owner@x.io", name: "Owner" } })).id;
  member = (await t.db.user.create({ data: { email: "member@x.io", name: "Member" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.membership.create({ data: { userId: member, workspaceId: ws.id, role: "MEMBER", crmAccess: true } });
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
}, 120_000);

beforeEach(() => sendMail.mockClear());
afterAll(async () => close?.());

const events = (projectId: string) => holder.db.nodeStatusEvent.findMany({ where: { projectId }, orderBy: { at: "asc" } });

describe("status history (feeds CFD, cycle time, throughput)", () => {
  it("records creation and every status change, including template projects and complete()", async () => {
    const { project } = await createProject(owner, ws.id, { name: "History", template: "agile-sprint-map" });
    expect((await events(project.id)).length).toBe(7); // project + 2 epics + 4 sprints, all created as TODO
    expect((await events(project.id)).every((e) => e.fromStatus === null && e.toStatus === "TODO")).toBe(true);

    const sprint = (await getTree(owner, project.id)).nodes.find((n) => n.type === "SPRINT")!;
    const task = (await transact(owner, (ctx) => createNode(ctx, { parentId: sprint.id, type: "TASK", title: "T", assigneeId: owner }))).result;
    await transact(owner, (ctx) => patchNode(ctx, task.id, { status: "IN_PROGRESS" }));
    await transact(owner, (ctx) => patchNode(ctx, task.id, { title: "renamed" })); // not a status change
    await transact(owner, (ctx) => completeNode(ctx, task.id));
    const mine = (await events(project.id)).filter((e) => e.nodeId === task.id).map((e) => `${e.fromStatus ?? "∅"}>${e.toStatus}`);
    expect(mine).toEqual(["∅>TODO", "TODO>IN_PROGRESS", "IN_PROGRESS>DONE"]);
  });

  it("records changes made through batch operations and ignores no-ops and non-work nodes", async () => {
    const { project } = await createProject(owner, ws.id, { name: "Batch" });
    const epic = (await transact(owner, (ctx) => createNode(ctx, { parentId: project.id, type: "EPIC", title: "E" }))).result;
    await runBatch(owner, [{ op: "patch", id: epic.id, patch: { status: "IN_PROGRESS" } }, { op: "patch", id: epic.id, patch: { status: "IN_PROGRESS" } }]);
    await transact(owner, (ctx) => createNode(ctx, { parentId: project.id, type: "DOCUMENT", title: "Doc" }));
    const log = await events(project.id);
    expect(log.filter((e) => e.nodeId === epic.id).map((e) => e.toStatus)).toEqual(["TODO", "IN_PROGRESS"]);
    expect(log.some((e) => e.toStatus === "TODO" && e.nodeId !== epic.id && e.nodeId !== project.id)).toBe(false);
    await transact(owner, (ctx) => archiveNode(ctx, epic.id));
    expect((await events(project.id)).length).toBe(log.length); // archiving is not a status change
  });
});

describe("deal stage history (feeds funnel and sales-cycle reports)", () => {
  it("records creation and each move, in order, with the actor", async () => {
    const [pipeline] = await listPipelines(owner, ws.id);
    const stage = (name: string) => pipeline!.stages.find((s) => s.name === name)!.id;
    const deal = await createDeal(owner, ws.id, { title: "Funnel", amount: 100, currency: "EUR" });
    await moveDeal(owner, deal.id, { stageId: stage("Qualification") });
    await moveDeal(owner, deal.id, { stageId: stage("Qualification") }); // same stage: nothing to record
    await winDeal(owner, deal.id);
    const log = await holder.db.dealStageEvent.findMany({ where: { dealId: deal.id }, orderBy: { at: "asc" } });
    expect(log.map((e) => [e.fromStageId, e.toStageId])).toEqual([[null, stage("New lead")], [stage("New lead"), stage("Qualification")], [stage("Qualification"), stage("Won")]]);
    expect(log.every((e) => e.actorId === owner && e.pipelineId === pipeline!.id)).toBe(true);

    const lost = await createDeal(owner, ws.id, { title: "Lost one", amount: 1, currency: "EUR" });
    await loseDeal(owner, lost.id, (await listLostReasons(owner, ws.id))[0]!.id);
    expect(await holder.db.dealStageEvent.count({ where: { dealId: lost.id } })).toBe(2);
  });
});

describe("notifications", () => {
  it("writes the bell entry, queues external channels in an outbox and de-duplicates by key", async () => {
    const id = await notify({ userId: member, workspaceId: ws.id, kind: "mention", title: "Hi", url: "/crm", dedupeKey: "k1" });
    expect(id).toBeTruthy();
    expect(await notify({ userId: member, workspaceId: ws.id, kind: "mention", title: "Hi again", dedupeKey: "k1" })).toBeNull();
    const row = await holder.db.notification.findUniqueOrThrow({ where: { id: id! } });
    expect(row.pendingChannels).toEqual(["email"]); // mention defaults: app + e-mail
    const { items, unread } = await listNotifications(member, { workspaceId: ws.id });
    expect(items.some((i) => i.id === id)).toBe(true);
    expect(unread).toBeGreaterThan(0);
  });

  it("delivers e-mail once with a workspace-aware link, and clears the outbox", async () => {
    const before = sendMail.mock.calls.length;
    const res = await deliverPending();
    expect(res.failed).toBe(0);
    const mails = sendMail.mock.calls.slice(before) as unknown as [{ to: string; subject: string; text: string }][];
    const hit = mails.find((m) => m[0].subject === "Hi");
    expect(hit?.[0].to).toBe("member@x.io");
    expect(hit?.[0].text).toContain(`/w/${ws.slug}/crm`);
    sendMail.mockClear();
    await deliverPending();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("keeps a failed delivery for the next run", async () => {
    const id = await notify({ userId: member, workspaceId: ws.id, kind: "reminder", title: "Retry me" });
    sendMail.mockRejectedValueOnce(new Error("smtp down"));
    expect((await deliverPending()).failed).toBe(1);
    expect((await holder.db.notification.findUniqueOrThrow({ where: { id: id! } })).pendingChannels).toEqual(["email"]);
    expect((await deliverPending()).sent).toBeGreaterThan(0);
    expect((await holder.db.notification.findUniqueOrThrow({ where: { id: id! } })).pendingChannels).toEqual([]);
  });

  it("honours personal preferences and marks things read", async () => {
    await setPreference(member, ws.id, "mention", []);
    const id = await notify({ userId: member, workspaceId: ws.id, kind: "mention", title: "Quiet" });
    expect((await holder.db.notification.findUniqueOrThrow({ where: { id: id! } })).pendingChannels).toEqual([]);
    expect((await getPreferences(member, ws.id)).find((p) => p.kind === "mention")).toMatchObject({ channels: [], custom: true });
    expect((await getPreferences(member, ws.id)).find((p) => p.kind === "lead")?.custom).toBe(false);

    expect((await markRead(member, { ids: [id!] })).updated).toBe(1);
    expect((await markRead(member, { ids: [id!] })).updated).toBe(0);
    expect((await markRead(owner, { ids: [id!] })).updated).toBe(0); // someone else's
    await markRead(member, { all: true, workspaceId: ws.id });
    expect((await listNotifications(member, { workspaceId: ws.id })).unread).toBe(0);
  });

  it("is triggered by mentions, assignments, won deals and leads", async () => {
    const { project } = await createProject(owner, ws.id, { name: "Notify" });
    const epic = (await transact(owner, (ctx) => createNode(ctx, { parentId: project.id, type: "EPIC", title: "E" }))).result;
    await transact(owner, (ctx) => createNode(ctx, { parentId: epic.id, type: "TASK", title: "Assigned at creation", assigneeId: member }));
    const t2 = (await transact(owner, (ctx) => createNode(ctx, { parentId: epic.id, type: "TASK", title: "Assigned later" }))).result;
    await transact(owner, (ctx) => patchNode(ctx, t2.id, { assigneeId: member }));
    await transact(owner, (ctx) => patchNode(ctx, t2.id, { assigneeId: owner })); // self-assignment: no bell for yourself
    await createComment(owner, epic.id, { body: { type: "doc", content: [] }, mentions: [member], parentCommentId: null });

    const deal = await createDeal(owner, ws.id, { title: "Big one", amount: 5000, currency: "EUR", ownerId: member });
    await winDeal(owner, deal.id);

    const kinds = (await holder.db.notification.findMany({ where: { userId: member }, select: { kind: true, payload: true } })).map((n) => `${n.kind}:${(n.payload as { title: string }).title}`);
    expect(kinds).toContain("assigned:You were assigned “Assigned at creation”");
    expect(kinds).toContain("assigned:You were assigned “Assigned later”");
    expect(kinds.some((k) => k.startsWith("mention:Owner mentioned you in “E”"))).toBe(true);
    expect(kinds).toContain("deal_won:Deal won: Big one");
    expect(await holder.db.notification.count({ where: { userId: owner, kind: "assigned" } })).toBe(0);
  });
});

describe("background jobs", () => {
  it("runs jobs inline when no queue is configured", async () => {
    expect(jobsMode()).toBe("inline");
    await expect(enqueue("notify/deliver")).resolves.toBeUndefined();
  });

  it("refreshAllProjects turns overdue work red, notifies admins once per day, and is idempotent", async () => {
    const { project } = await createProject(owner, ws.id, { name: "Going red" });
    const epic = (await transact(owner, (ctx) => createNode(ctx, { parentId: project.id, type: "EPIC", title: "E" }))).result;
    // overdue, assigned task → red, but written straight to the database so the stored health is stale
    await holder.db.node.create({ data: { workspaceId: ws.id, parentId: epic.id, rootId: project.id, type: "TASK", title: "Late", createdById: owner, assigneeId: owner, dueDate: new Date(Date.now() - 3 * DAY), startDate: new Date(Date.now() - 10 * DAY), data: {} } });
    expect((await holder.db.node.findUniqueOrThrow({ where: { id: project.id } })).health).toBe("GREEN");

    const first = await refreshAllProjects();
    expect(first.turnedRed).toBeGreaterThanOrEqual(1);
    expect((await holder.db.node.findUniqueOrThrow({ where: { id: project.id } })).health).toBe("RED");
    const count = () => holder.db.notification.count({ where: { userId: owner, kind: "project_red", payload: { path: ["projectId"], equals: project.id } } });
    expect(await count()).toBe(1);
    await refreshAllProjects();
    expect(await count()).toBe(1); // already red, and same dedupe key
  });

  it("dispatchReminders fires manual reminders once and warns about cold contacts and deals once a week", async () => {
    const person = await createContact(member, ws.id, { firstName: "Cold", lastName: "Person", emails: ["cold@x.io"], phones: [], messengers: {}, allowDuplicate: true, consentGiven: false });
    await holder.db.reminder.create({ data: { userId: member, targetNodeId: person.id, remindAt: new Date(Date.now() - 60_000), channel: "EMAIL" } });
    const stale = await createDeal(member, ws.id, { title: "Stale deal", amount: 10, currency: "EUR", primaryContactId: person.id, ownerId: member, nextStep: "Call", nextStepAt: new Date(Date.now() + DAY).toISOString() });
    await holder.db.deal.update({ where: { nodeId: stale.id }, data: { lastActivityAt: new Date(Date.now() - 40 * DAY), stageEnteredAt: new Date(Date.now() - 41 * DAY) } });
    await holder.db.contact.update({ where: { nodeId: person.id }, data: { lastContactedAt: new Date(Date.now() - 45 * DAY) } });

    const first = await dispatchReminders();
    expect(first.manual).toBe(1);
    expect(first.automatic).toBeGreaterThanOrEqual(2);
    const titles = (await holder.db.notification.findMany({ where: { userId: member } })).map((n) => (n.payload as { title: string }).title);
    expect(titles).toContain("Reminder: Cold Person");
    expect(titles).toContain("“Stale deal” is going cold");
    expect(titles).toContain("No contact with Cold Person for a month");
    const reminderRow = (await holder.db.notification.findMany({ where: { userId: member, kind: "reminder" } })).find((n) => (n.payload as { title: string }).title === "Reminder: Cold Person")!;
    expect(reminderRow.pendingChannels).toContain("email"); // the reminder asked for e-mail

    const second = await dispatchReminders();
    expect(second.manual).toBe(0);
    expect(second.automatic).toBe(0);
  });

  it("maintenance purges old lead submissions and expired tokens but keeps fresh data", async () => {
    await holder.db.leadIngest.createMany({ data: [{ workspaceId: ws.id, source: "form:x", status: "created", payload: {}, createdAt: new Date(Date.now() - 100 * DAY) }, { workspaceId: ws.id, source: "form:x", status: "created", payload: {} }] });
    await holder.db.verificationToken.create({ data: { identifier: "a@b.c", token: "t1", expires: new Date(Date.now() - 1000) } });
    const r = await maintenance();
    expect(r).toMatchObject({ leadSubmissions: 1, verificationTokens: 1 });
    expect(await holder.db.leadIngest.count({ where: { workspaceId: ws.id } })).toBe(1);
  });

  it("log an activity so the idle clock keeps deals out of the cold list", async () => {
    const deal = await holder.db.deal.findFirstOrThrow({ where: { node: { title: "Stale deal" } } });
    await createActivity(member, ws.id, { type: "CALL", subject: "Called", dealId: deal.nodeId });
    expect((await holder.db.deal.findUniqueOrThrow({ where: { nodeId: deal.nodeId } })).lastActivityAt!.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });
});
