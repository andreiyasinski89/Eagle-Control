import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { createInvitation, acceptInvitation } from "@/server/services/invitation";
import { runBatch } from "@/server/services/nodes/batch";
import {
  archiveNode,
  completeNode,
  createLink,
  createNode,
  createProject,
  moveNode,
  patchNode,
  restoreNode,
  setHealthOverride,
  transact,
} from "@/server/services/nodes/ops";
import { getNodeDetail, getTree, listProjects, searchNodes } from "@/server/services/nodes/queries";
import { createComment, listComments } from "@/server/services/comments";
import { createTag, setNodeTags } from "@/server/services/tags";

let close: () => Promise<void>;
let owner: string;
let member: string;
let outsider: string;
let ws: { id: string; slug: string };

const TODAY = new Date("2026-10-20T12:00:00Z");
const day = (s: string) => `${s}T00:00:00.000Z`;

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "owner@x.io", name: "Owner" } })).id;
  member = (await t.db.user.create({ data: { email: "member@x.io", name: "Member" } })).id;
  outsider = (await t.db.user.create({ data: { email: "out@x.io", name: "Out" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.membership.create({ data: { userId: member, workspaceId: ws.id, role: "MEMBER" } });
}, 120_000);

afterAll(async () => close?.());

const tree = async (projectId: string, user = owner) => {
  const t = await getTree(user, projectId, TODAY);
  const byTitle = (title: string) => {
    const n = t.nodes.find((x) => x.title === title);
    if (!n) throw new Error(`no node ${title}`);
    return n;
  };
  return { ...t, byTitle };
};

const add = async (parentId: string, type: "EPIC" | "SPRINT" | "TASK" | "SUBTASK" | "DOCUMENT" | "EVENT", title: string, extra: Record<string, unknown> = {}, user = owner) =>
  (await transact(user, (ctx) => createNode(ctx, { parentId, type, title, ...extra }))).result;

describe("projects & templates", () => {
  it("expands a template into epics and sprints", async () => {
    const { project } = await createProject(owner, ws.id, { name: "Launch", template: "agile-sprint-map" });
    const t = await tree(project.id);
    expect(t.nodes).toHaveLength(7);
    expect(t.nodes.filter((n) => n.type === "EPIC").map((n) => n.title).sort()).toEqual(["Backend", "Frontend"]);
    expect(t.byTitle("Launch").parentId).toBeNull();
  });

  it("lists projects for members only and enforces the Free plan limit", async () => {
    await createProject(owner, ws.id, { name: "Second" });
    await createProject(owner, ws.id, { name: "Third" });
    await expect(createProject(owner, ws.id, { name: "Fourth" })).rejects.toMatchObject({ status: 402, code: "plan_limit" });
    expect((await listProjects(owner, ws.id)).length).toBe(3);
    await holder.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
    await expect(listProjects(outsider, ws.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("nesting rules & moves", () => {
  it("rejects invalid nesting and root creation", async () => {
    const { project } = await createProject(owner, ws.id, { name: "P-rules" });
    await expect(add(project.id, "TASK", "Bad")).rejects.toMatchObject({ status: 422, code: "invalid_nesting" });
    await expect(
      transact(owner, (ctx) => createNode(ctx, { parentId: null, type: "PROJECT", title: "Root" })),
    ).rejects.toMatchObject({ code: "use_projects_endpoint" });
  });

  it("moves a task between sprints, keeps order and blocks cycles", async () => {
    const all = await listProjects(owner, ws.id);
    const launch = all.find((p) => p.title === "Launch")!;
    const t = await tree(launch.id);
    const sprints = t.nodes.filter((n) => n.type === "SPRINT");
    const [s1, s2] = sprints as [typeof sprints[0], typeof sprints[0]];
    const a = await add(s1.id, "TASK", "A");
    const b = await add(s1.id, "TASK", "B");
    expect(a.position).toBeLessThan(b.position);

    const moved = (await transact(owner, (ctx) => moveNode(ctx, a.id, { parentId: s2.id }))).result;
    expect(moved.parentId).toBe(s2.id);

    const epic = t.nodes.find((n) => n.id === s1.parentId)!;
    await expect(transact(owner, (ctx) => moveNode(ctx, epic.id, { parentId: s2.id }))).rejects.toMatchObject({ status: 422 });
    await expect(transact(owner, (ctx) => moveNode(ctx, a.id, { parentId: launch.id }))).rejects.toMatchObject({
      code: "invalid_move",
    });
  });

  it("keeps sibling order after many inserts at the same spot (rebalances float positions)", async () => {
    const launch = (await listProjects(owner, ws.id)).find((p) => p.title === "Launch")!;
    const epic = (await tree(launch.id)).nodes.find((n) => n.type === "EPIC")!;
    const first = await add(epic.id, "TASK", "first");
    await add(epic.id, "TASK", "last");
    const inserted: string[] = [];
    for (let i = 0; i < 45; i++) inserted.push((await add(epic.id, "TASK", `ins-${i}`, { afterId: first.id })).id);
    const t = await tree(launch.id);
    const order = t.nodes.filter((n) => n.parentId === epic.id && n.type === "TASK").sort((a, b) => a.position - b.position);
    const titles = order.map((n) => n.title).filter((x) => x.startsWith("ins-") || x === "first" || x === "last");
    expect(titles[0]).toBe("first");
    expect(titles.at(-1)).toBe("last");
    // newest insert right after "first" each time → reverse creation order
    expect(titles.slice(1, 4)).toEqual(["ins-44", "ins-43", "ins-42"]);
    expect(new Set(order.map((n) => n.position)).size).toBe(order.length);
  }, 60_000);
});

describe("progress & health", () => {
  it("aggregates weighted progress and recomputes on change", async () => {
    const { project } = await createProject(owner, ws.id, { name: "Weights" });
    const epic = await add(project.id, "EPIC", "E");
    const big = await add(epic.id, "TASK", "big", { estimation: 8, assigneeId: owner });
    const small = await add(epic.id, "TASK", "small", { estimation: 2, assigneeId: owner });
    await transact(owner, (ctx) => patchNode(ctx, big.id, { progress: 100 }));
    let t = await tree(project.id);
    expect(t.byTitle("E").progress).toBe(80);
    expect(t.byTitle("Weights").progress).toBe(80);

    await transact(owner, (ctx) => patchNode(ctx, small.id, { progress: 100 }));
    t = await tree(project.id);
    expect(t.byTitle("Weights").progress).toBe(100);

    await expect(transact(owner, (ctx) => patchNode(ctx, epic.id, { progress: 10 }))).rejects.toMatchObject({ code: "progress_derived" });
  });

  it("DONE implies 100%, complete cascades to subtasks", async () => {
    const proj = (await listProjects(owner, ws.id)).find((p) => p.title === "Weights")!;
    const epic = (await tree(proj.id)).byTitle("E");
    const task = await add(epic.id, "TASK", "with-subs", { assigneeId: owner });
    await add(task.id, "SUBTASK", "s1", { assigneeId: owner });
    await add(task.id, "SUBTASK", "s2", { assigneeId: owner });
    await transact(owner, (ctx) => completeNode(ctx, task.id));
    const t = await tree(proj.id);
    expect(t.byTitle("s1")).toMatchObject({ status: "DONE", progress: 100 });
    expect(t.byTitle("with-subs").progress).toBe(100);

    const leaf = await add(epic.id, "TASK", "leaf", { assigneeId: owner });
    const patched = (await transact(owner, (ctx) => patchNode(ctx, leaf.id, { status: "DONE" }))).result;
    expect(patched.progress).toBe(100);
  });

  it("colours overdue work red and bubbles it up when more than 25% is red", async () => {
    const { project } = await createProject(owner, ws.id, { name: "Heat" });
    const epic = await add(project.id, "EPIC", "HE");
    const late = await add(epic.id, "TASK", "late", { assigneeId: owner, startDate: day("2026-10-01"), dueDate: day("2026-10-10") });
    await add(epic.id, "TASK", "fine", { assigneeId: owner });
    const t = await tree(project.id);
    expect(t.byTitle("late").health).toBe("RED");
    expect(t.byTitle("fine").health).toBe("GREEN");
    expect(t.byTitle("HE").health).toBe("RED"); // 1 of 2 children is red (50% > 25%)

    await transact(owner, (ctx) => setHealthOverride(ctx, late.id, { health: "GREEN", note: "Client agreed to extend" }));
    expect((await tree(project.id)).byTitle("late").health).toBe("GREEN");
    await transact(owner, (ctx) => setHealthOverride(ctx, late.id, null));
    expect((await tree(project.id)).byTitle("late").health).toBe("RED");
  });

  it("an unfinished blocker turns the blocked task red until it is done", async () => {
    const proj = (await listProjects(owner, ws.id)).find((p) => p.title === "Heat")!;
    const epic = (await tree(proj.id)).byTitle("HE");
    const blocker = await add(epic.id, "TASK", "blocker", { assigneeId: owner });
    const blocked = await add(epic.id, "TASK", "blocked", { assigneeId: owner });
    await transact(owner, (ctx) => createLink(ctx, { fromNodeId: blocker.id, toNodeId: blocked.id, kind: "BLOCKS" }));
    expect((await tree(proj.id)).byTitle("blocked")).toMatchObject({ health: "RED", blocked: true });
    await transact(owner, (ctx) => completeNode(ctx, blocker.id));
    expect((await tree(proj.id)).byTitle("blocked").health).toBe("GREEN");
    await expect(
      transact(owner, (ctx) => createLink(ctx, { fromNodeId: blocker.id, toNodeId: blocked.id, kind: "BLOCKS" })),
    ).rejects.toMatchObject({ code: "link_exists" });
  });
});

describe("archive, restore & batch", () => {
  it("archives a subtree, hides it from the tree and restores exactly what was archived", async () => {
    const proj = (await listProjects(owner, ws.id)).find((p) => p.title === "Weights")!;
    const epic = (await tree(proj.id)).byTitle("E");
    const before = (await tree(proj.id)).nodes.length;
    const sub = await add(epic.id, "TASK", "temp", { assigneeId: owner });
    await add(sub.id, "SUBTASK", "temp-child", { assigneeId: owner });
    const { result } = await transact(owner, (ctx) => archiveNode(ctx, sub.id));
    expect(result.ids).toHaveLength(2);
    expect((await tree(proj.id)).nodes.length).toBe(before);
    await transact(owner, (ctx) => restoreNode(ctx, sub.id));
    expect((await tree(proj.id)).nodes.length).toBe(before + 2);
  });

  it("rolls a batch back atomically when one op fails", async () => {
    const proj = (await listProjects(owner, ws.id)).find((p) => p.title === "Weights")!;
    const epic = (await tree(proj.id)).byTitle("E");
    const before = (await tree(proj.id)).nodes.length;
    await expect(
      runBatch(owner, [
        { op: "create", input: { parentId: epic.id, type: "TASK", title: "ok-1" } },
        { op: "create", input: { parentId: epic.id, type: "EPIC", title: "invalid" } },
      ]),
    ).rejects.toMatchObject({ code: "invalid_nesting" });
    expect((await tree(proj.id)).nodes.length).toBe(before);

    const ok = await runBatch(owner, [
      { op: "create", input: { parentId: epic.id, type: "TASK", title: "b1" } },
      { op: "create", input: { parentId: epic.id, type: "TASK", title: "b2" } },
    ]);
    expect(ok.results).toHaveLength(2);
    expect((await tree(proj.id)).nodes.length).toBe(before + 2);
  });
});

describe("access control", () => {
  it("hides projects from non-members and guests without access; clients are read-only", async () => {
    const proj = (await listProjects(owner, ws.id)).find((p) => p.title === "Weights")!;
    await expect(getTree(outsider, proj.id)).rejects.toMatchObject({ status: 404 });

    const guest = (await holder.db.user.create({ data: { email: "guest@x.io" } })).id;
    const client = (await holder.db.user.create({ data: { email: "client@x.io" } })).id;
    await holder.db.membership.createMany({
      data: [
        { userId: guest, workspaceId: ws.id, role: "GUEST" },
        { userId: client, workspaceId: ws.id, role: "CLIENT" },
      ],
    });
    await expect(getTree(guest, proj.id)).rejects.toMatchObject({ status: 404 });
    await holder.db.projectMember.createMany({ data: [{ nodeId: proj.id, userId: guest }, { nodeId: proj.id, userId: client }] });

    expect((await getTree(guest, proj.id)).nodes.length).toBeGreaterThan(0);
    const epic = (await tree(proj.id)).byTitle("E");
    await expect(add(epic.id, "TASK", "by-client", {}, client)).rejects.toMatchObject({ status: 403 });
    await expect(add(epic.id, "TASK", "by-guest", {}, guest)).resolves.toBeTruthy();
    expect(await searchNodes(guest, ws.id, "by-guest")).toHaveLength(1);
    expect(await listProjects(guest, ws.id)).toHaveLength(1);
  });

  it("only members can be assignees", async () => {
    const proj = (await listProjects(owner, ws.id)).find((p) => p.title === "Weights")!;
    const epic = (await tree(proj.id)).byTitle("E");
    await expect(add(epic.id, "TASK", "x", { assigneeId: outsider })).rejects.toMatchObject({ code: "invalid_assignee" });
  });
});

describe("comments, tags, search, detail", () => {
  it("notifies mentioned members only, supports threads", async () => {
    const proj = (await listProjects(owner, ws.id)).find((p) => p.title === "Weights")!;
    const epic = (await tree(proj.id)).byTitle("E");
    const doc = { type: "doc" as const, content: [] };
    const root = await createComment(owner, epic.id, { body: doc, mentions: [member, outsider, owner], parentCommentId: null });
    expect(root.mentions).toEqual([member]);
    const notes = await holder.db.notification.findMany({ where: { workspaceId: ws.id, kind: "mention" } });
    expect(notes.map((n) => n.userId)).toEqual([member]);

    const reply = await createComment(member, epic.id, { body: doc, mentions: [], parentCommentId: root.id });
    expect(reply.parentCommentId).toBe(root.id);
    expect(await listComments(owner, epic.id)).toHaveLength(2);
    await expect(createComment(owner, epic.id, { body: doc, mentions: [], parentCommentId: "nope" })).rejects.toMatchObject({ code: "invalid_parent" });
  });

  it("tags nodes and returns rich detail with breadcrumb and status summary", async () => {
    const proj = (await listProjects(owner, ws.id)).find((p) => p.title === "Weights")!;
    const t = await tree(proj.id);
    const epic = t.byTitle("E");
    const tag = await createTag(owner, ws.id, { name: "urgent", color: "#ff0000" });
    await expect(createTag(owner, ws.id, { name: "urgent", color: "#00ff00" })).rejects.toMatchObject({ code: "tag_exists" });
    await setNodeTags(owner, epic.id, [tag.id]);
    expect((await tree(proj.id)).byTitle("E").tagIds).toEqual([tag.id]);

    const detail = await getNodeDetail(owner, t.byTitle("big").id, TODAY);
    expect(detail.breadcrumb.map((b) => b.title)).toEqual(["Weights", "E"]);
    const epicDetail = await getNodeDetail(owner, epic.id, TODAY);
    expect(epicDetail.tags[0]?.name).toBe("urgent");
    expect(epicDetail.statusSummary.DONE).toBeGreaterThan(0);
  });

  it("searches by title within the workspace", async () => {
    const hits = await searchNodes(owner, ws.id, "blocker");
    expect(hits.map((h) => h.title)).toContain("blocker");
    expect(await searchNodes(owner, ws.id, "   ")).toEqual([]);
  });
});

describe("invitations end-to-end (phase 1 on a real DB)", () => {
  it("invites by email, accepts only with the matching account, and cannot be reused", async () => {
    const { sendMail } = await import("@/server/mail");
    vi.mocked(sendMail).mockClear();
    process.env.APP_URL = "http://app.test";
    process.env.DATABASE_URL ??= "postgresql://x";
    process.env.AUTH_SECRET ??= "x";

    await createInvitation({ workspaceId: ws.id, actor: { userId: owner, role: "OWNER" }, email: "New@x.io", role: "MEMBER", crmAccess: true, projectIds: [] });
    const mail = vi.mocked(sendMail).mock.calls[0]?.[0];
    const token = mail?.text.match(/invite\/(\S+)/)?.[1] ?? "";
    expect(token.length).toBeGreaterThan(30);

    const invitee = await holder.db.user.create({ data: { email: "new@x.io" } });
    await expect(acceptInvitation(token, { id: outsider, email: "out@x.io" })).rejects.toMatchObject({ code: "wrong_account" });
    const joined = await acceptInvitation(token, { id: invitee.id, email: "new@x.io" });
    expect(joined.id).toBe(ws.id);
    const m = await holder.db.membership.findUnique({ where: { userId_workspaceId: { userId: invitee.id, workspaceId: ws.id } } });
    expect(m).toMatchObject({ role: "MEMBER", crmAccess: true });
    await expect(acceptInvitation(token, { id: invitee.id, email: "new@x.io" })).rejects.toMatchObject({ status: 404 });
  });
});
