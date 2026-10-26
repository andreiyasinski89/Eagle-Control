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
const storage = vi.hoisted(() => ({ presignUpload: vi.fn(async (key: string) => `https://s3.test/up/${key}`), presignDownload: vi.fn(async (key: string) => `https://s3.test/dl/${key}`), deleteObject: vi.fn() }));
vi.mock("@/server/storage", () => storage);

import { createWorkspace } from "@/server/services/workspace";
import { createNode, createProject, patchNode, transact } from "@/server/services/nodes/ops";
import { getTree, getNodeDetail, listProjects, searchNodes } from "@/server/services/nodes/queries";
import { createComment, listComments } from "@/server/services/comments";
import { listNotifications } from "@/server/services/notify";
import { addEntry } from "@/server/services/time";
import { workspaceCalendar, calendarQuerySchema } from "@/server/services/nodes/views";
import { authorizeRooms } from "@/server/realtime/access";
import { authenticate, createToken } from "@/server/public-api/tokens";
import { addPortalComment, confirmPortalUpload, decide, getPortalNode, getPortalProject, listPortalProjects, portalDownloadUrl, requestApproval, setAttachmentVisibility, startPortalUpload } from "@/server/services/portal";
import { projectMetrics, metricsQuerySchema } from "@/server/services/metrics";
import { can } from "@/server/policies";

let close: () => Promise<void>;
let owner: string;
let member: string;
let client: string;
let client2: string;
let ws: { id: string; slug: string };
let projectId: string;
let otherProjectId: string;
let sharedEpic: string;
let sharedTask: string;
let hiddenTask: string;
let deepShared: string;
let doc: string;

const doc1 = { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: "INTERNAL SECRET" }] }] };
const names = (r: { nodes: { title: string }[] }) => r.nodes.map((n) => n.title).sort();

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://x";
  process.env.AUTH_SECRET ??= "x";
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  member = (await t.db.user.create({ data: { email: "m@x.io", name: "Member" } })).id;
  client = (await t.db.user.create({ data: { email: "c@acme.io", name: "Cara Client" } })).id;
  client2 = (await t.db.user.create({ data: { email: "c2@other.io", name: "Other Client" } })).id;
  ws = await createWorkspace(owner, "Agency");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  await t.db.membership.create({ data: { userId: member, workspaceId: ws.id, role: "MEMBER", crmAccess: true } });
  await t.db.membership.create({ data: { userId: client, workspaceId: ws.id, role: "CLIENT" } });
  await t.db.membership.create({ data: { userId: client2, workspaceId: ws.id, role: "CLIENT" } });

  projectId = (await createProject(owner, ws.id, { name: "Website for Acme", template: "empty" })).project.id;
  otherProjectId = (await createProject(owner, ws.id, { name: "Other client's project" })).project.id;
  await t.db.projectMember.create({ data: { nodeId: projectId, userId: client, visibleToClientOnly: true } });
  await t.db.projectMember.create({ data: { nodeId: otherProjectId, userId: client2, visibleToClientOnly: true } });

  const mk = async (parentId: string, type: "EPIC" | "SPRINT" | "TASK" | "DOCUMENT", title: string, extra: Record<string, unknown> = {}) => (await transact(owner, (ctx) => createNode(ctx, { parentId, type, title, ...extra } as never))).result.id;
  sharedEpic = await mk(projectId, "EPIC", "Design phase");
  const internalSprint = await mk(sharedEpic, "SPRINT", "Internal sprint (hidden)");
  deepShared = await mk(internalSprint, "TASK", "Homepage mockups");
  sharedTask = await mk(sharedEpic, "TASK", "Logo");
  hiddenTask = await mk(sharedEpic, "TASK", "Margin discussion (internal)", { assigneeId: member, estimation: 13 });
  doc = await mk(sharedEpic, "DOCUMENT", "Brand guide", { data: { kind: "note", content: { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: "Use blue" }] }] } } });
  for (const id of [sharedEpic, sharedTask, deepShared, doc]) await transact(owner, (ctx) => patchNode(ctx, id, { visibleToClient: true }));
  await t.db.node.update({ where: { id: sharedTask }, data: { description: "INTERNAL DESCRIPTION" } });
  await createComment(owner, sharedTask, { body: doc1, mentions: [], parentCommentId: null });
  await createComment(owner, sharedTask, { body: { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: "Hi Cara, here is the logo" }] }] }, mentions: [], parentCommentId: null, visibleToClient: true });
  await t.db.attachment.create({ data: { nodeId: sharedTask, fileName: "internal-costs.xlsx", mime: "application/vnd.ms-excel", size: 10, url: `${ws.id}/${sharedTask}/a-internal`, uploadedById: owner } });
  await t.db.attachment.create({ data: { nodeId: sharedTask, fileName: "logo-v1.png", mime: "image/png", size: 10, url: `${ws.id}/${sharedTask}/b-logo`, uploadedById: owner, visibleToClient: true } });
}, 120_000);
afterAll(async () => close?.());

describe("what a client sees", () => {
  it("lists only the projects they were added to", async () => {
    const mine = await listPortalProjects(client, ws.id);
    expect(mine.items.map((p) => p.title)).toEqual(["Website for Acme"]);
    expect((await listPortalProjects(client2, ws.id)).items.map((p) => p.title)).toEqual(["Other client's project"]);
    expect((await listPortalProjects(owner, ws.id)).items).toHaveLength(2); // an owner may preview any project
    await expect(listPortalProjects(member, ws.id)).rejects.toMatchObject({ status: 404 }); // the team uses the app
  });

  it("shows shared nodes only, joined over hidden layers, with no internal fields", async () => {
    const p = await getPortalProject(client, projectId);
    expect(names(p)).toEqual(["Brand guide", "Design phase", "Homepage mockups", "Logo"]);
    const byTitle = Object.fromEntries(p.nodes.map((n) => [n.title, n]));
    expect(byTitle["Homepage mockups"]!.parentId).toBe(sharedEpic); // the hidden sprint between them disappears
    expect(byTitle["Design phase"]!.parentId).toBe(projectId);
    const json = JSON.stringify(p);
    for (const secret of ["Internal sprint", "Margin discussion", "INTERNAL DESCRIPTION", "assigneeId", "estimation", member, "Member"]) expect(json, secret).not.toContain(secret);
    expect(byTitle["Brand guide"]).toMatchObject({ content: expect.objectContaining({ type: "doc" }) });
    expect(p.me).toEqual({ canDecide: true, preview: false });
  });

  it("shows comments and files only when they were shared", async () => {
    const n = await getPortalNode(client, sharedTask);
    expect(n.comments.map((c) => c.text)).toEqual(["Hi Cara, here is the logo"]);
    expect(n.comments[0]).toMatchObject({ fromTeam: true });
    expect(JSON.stringify(n)).not.toContain("INTERNAL SECRET");
    expect(n.attachments.map((a) => a.fileName)).toEqual(["logo-v1.png"]);
    const internal = await holder.db.attachment.findFirstOrThrow({ where: { fileName: "internal-costs.xlsx" } });
    const shared = await holder.db.attachment.findFirstOrThrow({ where: { fileName: "logo-v1.png" } });
    await expect(portalDownloadUrl(client, internal.id)).rejects.toMatchObject({ status: 404 });
    expect(await portalDownloadUrl(client, shared.id)).toContain("b-logo");
  });
});

describe("what a client must not reach", () => {
  it("treats hidden nodes, other projects and unknown ids the same way: not found", async () => {
    for (const id of [hiddenTask, otherProjectId, "nope"]) {
      await expect(getPortalNode(client, id), id).rejects.toMatchObject({ status: 404 });
      await expect(addPortalComment(client, id, { text: "hi" }), id).rejects.toMatchObject({ status: 404 });
    }
    await expect(getPortalProject(client, otherProjectId)).rejects.toMatchObject({ status: 404 });
    await expect(getPortalProject(client2, projectId)).rejects.toMatchObject({ status: 404 });
    await expect(startPortalUpload(client, hiddenTask, { fileName: "a.png", mime: "image/png", size: 5 })).rejects.toMatchObject({ status: 404 });
  });

  it("is locked out of the whole workspace app and API, however the id was obtained", async () => {
    await expect(getTree(client, projectId)).rejects.toMatchObject({ status: 403 });
    await expect(getNodeDetail(client, sharedTask)).rejects.toMatchObject({ status: 403 });
    await expect(listProjects(client, ws.id)).rejects.toMatchObject({ status: 403 });
    await expect(searchNodes(client, ws.id, "Margin")).rejects.toMatchObject({ status: 403 });
    await expect(listComments(client, sharedTask)).rejects.toMatchObject({ status: 403 });
    await expect(createComment(client, sharedTask, { body: doc1, mentions: [], parentCommentId: null })).rejects.toMatchObject({ status: 403 });
    await expect(transact(client, (ctx) => patchNode(ctx, sharedTask, { title: "Hacked" }))).rejects.toMatchObject({ status: 403 });
    await expect(addEntry(client, sharedTask, { minutes: 5, date: "2026-10-26", billable: true })).rejects.toMatchObject({ status: 403 });
    await expect(workspaceCalendar(client, ws.id, calendarQuerySchema.parse({ from: "2026-10-01", to: "2026-10-31" }))).rejects.toMatchObject({ status: 403 });
    await expect(projectMetrics(client, projectId, metricsQuerySchema.parse({}))).rejects.toMatchObject({ status: 403 });
    expect(can({ role: "CLIENT", crmAccess: true }, "workspace:read")).toBe(false);
    expect(can({ role: "CLIENT", crmAccess: true }, "comment:write")).toBe(false);
    expect((await holder.db.node.findUniqueOrThrow({ where: { id: sharedTask } })).title).toBe("Logo");
  });

  it("gets no live rooms and no API tokens", async () => {
    expect((await authorizeRooms(client, [`project:${projectId}`, "user"])).size).toBe(1); // only their own notification room
    await expect(createToken(client, ws.id, { name: "x", scope: "read", expiresInDays: 1 })).rejects.toMatchObject({ status: 403 });
    const raw = await holder.db.apiToken.create({ data: { workspaceId: ws.id, userId: client, name: "planted", prefix: "mo_planted", tokenHash: "h".repeat(64) } });
    expect(raw.id).toBeTruthy();
    await expect(authenticate("Bearer mo_nonexistent")).rejects.toMatchObject({ status: 401 });
  });

  it("stops at the plan: without the portal feature nobody gets in", async () => {
    await holder.db.workspace.update({ where: { id: ws.id }, data: { plan: "FREE" } });
    await expect(getPortalProject(client, projectId)).rejects.toMatchObject({ status: 402 });
    await expect(listPortalProjects(client, ws.id)).rejects.toMatchObject({ status: 402 });
    await holder.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  });

  it("loses access the moment the share is withdrawn", async () => {
    await transact(owner, (ctx) => patchNode(ctx, sharedTask, { visibleToClient: false }));
    expect(names(await getPortalProject(client, projectId))).not.toContain("Logo");
    await expect(getPortalNode(client, sharedTask)).rejects.toMatchObject({ status: 404 });
    const shared = await holder.db.attachment.findFirstOrThrow({ where: { fileName: "logo-v1.png" } });
    await expect(portalDownloadUrl(client, shared.id)).rejects.toMatchObject({ status: 404 });
    await transact(owner, (ctx) => patchNode(ctx, sharedTask, { visibleToClient: true }));
    await holder.db.projectMember.deleteMany({ where: { nodeId: projectId, userId: client } });
    await expect(getPortalProject(client, projectId)).rejects.toMatchObject({ status: 404 });
    await holder.db.projectMember.create({ data: { nodeId: projectId, userId: client, visibleToClientOnly: true } });
  });
});

describe("working with the team", () => {
  it("lets a client comment, and tells the right people", async () => {
    await holder.db.node.update({ where: { id: sharedTask }, data: { assigneeId: member } });
    await addPortalComment(client, sharedTask, { text: "Can the logo be bigger?" });
    const n = await getPortalNode(client, sharedTask);
    expect(n.comments.map((c) => [c.text, c.mine])).toEqual([["Hi Cara, here is the logo", false], ["Can the logo be bigger?", true]]);
    const inbox = await listNotifications(member, { workspaceId: ws.id, unreadOnly: false, limit: 10 });
    expect(inbox.items.some((i) => i.kind === "client_activity" && JSON.stringify(i.payload).includes("Cara Client commented"))).toBe(true);
    expect((await listNotifications(client, { workspaceId: ws.id, unreadOnly: false, limit: 10 })).items).toHaveLength(0);
    const staffView = await listComments(owner, sharedTask);
    expect(staffView.map((c) => c.visibleToClient)).toEqual([false, true, true]); // the team sees client comments in the app
  });

  it("keeps team comments internal unless they are written for the client, and only on shared nodes", async () => {
    await expect(createComment(owner, hiddenTask, { body: doc1, mentions: [], parentCommentId: null, visibleToClient: true })).rejects.toMatchObject({ code: "not_shared" });
    await createComment(owner, sharedTask, { body: doc1, mentions: [], parentCommentId: null });
    expect((await getPortalNode(client, sharedTask)).comments).toHaveLength(2);
  });

  it("runs an approval round: request, one decision, no second answer", async () => {
    await expect(requestApproval(owner, hiddenTask, {})).rejects.toMatchObject({ code: "not_shared" });
    const ap = await requestApproval(owner, sharedTask, { request: "Please approve the logo" });
    await expect(requestApproval(owner, sharedTask, {})).rejects.toMatchObject({ code: "already_pending" });
    const mail = await listNotifications(client, { workspaceId: ws.id, unreadOnly: false, limit: 10 });
    expect(JSON.stringify(mail.items[0]!.payload)).toContain(`/portal/${ws.slug}/p/${projectId}?node=${sharedTask}`);
    expect((await getPortalProject(client, projectId)).nodes.find((n) => n.id === sharedTask)!.approvalId).toBe(ap.id);

    await expect(decide(owner, ap.id, { decision: "APPROVED" })).rejects.toMatchObject({ status: 403 }); // a previewing owner cannot sign for the client
    await expect(decide(client2, ap.id, { decision: "APPROVED" })).rejects.toMatchObject({ status: 404 }); // nor another client
    await expect(decide(client, ap.id, { decision: "CHANGES_REQUESTED" })).rejects.toMatchObject({ code: "note_required" });
    expect(await decide(client, ap.id, { decision: "CHANGES_REQUESTED", note: "Bigger, please" })).toEqual({ status: "CHANGES_REQUESTED" });
    await expect(decide(client, ap.id, { decision: "APPROVED" })).rejects.toMatchObject({ code: "already_decided" });
    const told = await listNotifications(owner, { workspaceId: ws.id, unreadOnly: false, limit: 10 });
    expect(told.items.some((i) => JSON.stringify(i.payload).includes("asked for changes"))).toBe(true);

    const second = await requestApproval(owner, sharedTask, {});
    await decide(client, second.id, { decision: "APPROVED" });
    expect((await holder.db.approval.findMany({ where: { nodeId: sharedTask }, orderBy: { createdAt: "asc" } })).map((a) => a.status)).toEqual(["CHANGES_REQUESTED", "APPROVED"]);
  });

  it("lets only one of two simultaneous answers win", async () => {
    const ap = await requestApproval(owner, doc, {});
    const results = await Promise.allSettled([decide(client, ap.id, { decision: "APPROVED" }), decide(client, ap.id, { decision: "CHANGES_REQUESTED", note: "no" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("accepts client uploads for shared nodes only, and the team decides what else is shared", async () => {
    const up = await startPortalUpload(client, sharedTask, { fileName: "brief 2.pdf", mime: "application/pdf", size: 1000 });
    expect(up.key.startsWith(`${ws.id}/${sharedTask}/`)).toBe(true);
    await expect(confirmPortalUpload(client, sharedTask, { key: `${ws.id}/${hiddenTask}/x-evil.pdf`, fileName: "evil.pdf", mime: "application/pdf", size: 5 })).rejects.toMatchObject({ code: "invalid_key" });
    await confirmPortalUpload(client, sharedTask, { key: up.key, fileName: "brief 2.pdf", mime: "application/pdf", size: 1000 });
    expect((await getPortalNode(client, sharedTask)).attachments.map((a) => a.fileName)).toContain("brief 2.pdf");
    const internal = await holder.db.attachment.findFirstOrThrow({ where: { fileName: "internal-costs.xlsx" } });
    await expect(setAttachmentVisibility(client, internal.id, true)).rejects.toMatchObject({ status: 403 });
    await setAttachmentVisibility(owner, internal.id, true);
    expect((await getPortalNode(client, sharedTask)).attachments.map((a) => a.fileName)).toContain("internal-costs.xlsx");
    await setAttachmentVisibility(owner, internal.id, false);
  });
});

