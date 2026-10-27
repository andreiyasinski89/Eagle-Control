import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient, ops: 0 }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { createNode, createProject, transact } from "@/server/services/nodes/ops";
import { createTaskTree } from "@/server/services/nodes/task-tree";
import { listMyTasks } from "@/server/services/nodes/my-tasks";
import { getTree } from "@/server/services/nodes/queries";
import { createTaskTreeSchema } from "@/modules/nodes/schemas";
import { parseTaskOutline } from "@/modules/nodes/task-outline";
import { dispatch } from "@/server/public-api/dispatch";
import { createToken } from "@/server/public-api/tokens";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let member: string;
let outsider: string;
let ws: { id: string };
let projectId: string;
let epicId: string;

const make = (input: Parameters<typeof createTaskTree>[1]) => transact(owner, (ctx) => createTaskTree(ctx, input));

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db.$extends({ query: { $allOperations: async ({ args, query }) => { holder.ops++; return query(args); } } }) as unknown as PrismaClient;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  member = (await t.db.user.create({ data: { email: "m@x.io", name: "Member" } })).id;
  outsider = (await t.db.user.create({ data: { email: "x@x.io", name: "Outsider" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  await t.db.membership.create({ data: { userId: member, workspaceId: ws.id, role: "MEMBER" } });
  projectId = (await createProject(owner, ws.id, { name: "Launch", template: "empty", estimationUnit: "HOURS" })).project.id;
  epicId = (await transact(owner, (ctx) => createNode(ctx, { parentId: projectId, type: "EPIC", title: "Epic" }))).result.id;
}, 120_000);
afterAll(async () => close?.());

describe("a list of tasks with subtasks, created together", () => {
  it("makes the tasks under the epic and each task's subtasks under it, in the order typed", async () => {
    const outline = parseTaskOutline("Prepare the launch\n  Write the announcement\n  Book the venue\nUpdate the website\n  Check the links");
    const { result } = await make({ parentId: epicId, tasks: outline.tasks, assigneeId: owner, dueDate: "2026-11-10T00:00:00.000Z" });
    expect(result.tasks.map((t) => [t.title, t.subtasks.map((s) => s.title)])).toEqual([
      ["Prepare the launch", ["Write the announcement", "Book the venue"]],
      ["Update the website", ["Check the links"]],
    ]);

    const task = await raw.node.findUniqueOrThrow({ where: { id: result.tasks[0]!.id } });
    expect(task).toMatchObject({ type: "TASK", parentId: epicId, rootId: projectId, status: "TODO", assigneeId: owner, createdById: owner, workspaceId: ws.id });
    expect(task.dueDate?.toISOString()).toBe("2026-11-10T00:00:00.000Z");
    const sub = await raw.node.findUniqueOrThrow({ where: { id: result.tasks[0]!.subtasks[1]!.id } });
    expect(sub).toMatchObject({ type: "SUBTASK", parentId: task.id, rootId: projectId, assigneeId: owner });

    const positions = (await raw.node.findMany({ where: { parentId: epicId, type: "TASK" }, orderBy: { position: "asc" }, select: { title: true } })).map((n) => n.title);
    expect(positions).toEqual(["Prepare the launch", "Update the website"]);
    const subs = (await raw.node.findMany({ where: { parentId: task.id }, orderBy: { position: "asc" }, select: { title: true } })).map((n) => n.title);
    expect(subs).toEqual(["Write the announcement", "Book the venue"]);
  });

  it("records what a one-by-one creation records: status history, audit entries, and the project tree", async () => {
    expect(await raw.nodeStatusEvent.count({ where: { projectId, toStatus: "TODO", fromStatus: null } })).toBeGreaterThanOrEqual(5);
    expect(await raw.activityLog.count({ where: { workspaceId: ws.id, action: "node.created", nodeId: { not: null } } })).toBeGreaterThanOrEqual(5);
    expect(await raw.activityLog.count({ where: { action: "tasks.created", nodeId: epicId } })).toBe(1);
    const tree = await getTree(owner, projectId);
    const sub = tree.nodes.find((n) => n.title === "Book the venue");
    expect(sub).toMatchObject({ type: "SUBTASK", status: "TODO" });
    expect(tree.nodes.find((n) => n.title === "Prepare the launch")?.childCount).toBe(2);
  });

  it("appends after what is already there", async () => {
    const { result } = await make({ parentId: epicId, tasks: [{ title: "Later one", subtasks: [] }] });
    const last = await raw.node.findMany({ where: { parentId: epicId, type: "TASK" }, orderBy: { position: "desc" }, take: 1 });
    expect(last[0]?.id).toBe(result.tasks[0]?.id);
  });

  it("works with a few database calls however many tasks there are", async () => {
    const outline = parseTaskOutline(Array.from({ length: 33 }, (_, i) => `Task ${i}\n  Part ${i}a\n  Part ${i}b`).join("\n"));
    expect(outline.count).toEqual({ tasks: 33, subtasks: 66 }); // 99 lines, within the 100 allowed
    holder.ops = 0;
    await make({ parentId: epicId, tasks: outline.tasks, assigneeId: owner });
    expect(holder.ops).toBeLessThan(30); // creating 99 nodes one by one needs several hundred
    expect(await raw.node.count({ where: { rootId: projectId, type: "SUBTASK" } })).toBeGreaterThanOrEqual(69);
  }, 60_000);

  it("a sprint takes tasks too; a task, a project or a document does not", async () => {
    const sprint = (await transact(owner, (ctx) => createNode(ctx, { parentId: epicId, type: "SPRINT", title: "Sprint 1" }))).result.id;
    await expect(make({ parentId: sprint, tasks: [{ title: "In the sprint", subtasks: [] }] })).resolves.toBeTruthy();
    const someTask = (await raw.node.findFirstOrThrow({ where: { parentId: epicId, type: "TASK" } })).id;
    await expect(make({ parentId: someTask, tasks: [{ title: "Nope", subtasks: [] }] })).rejects.toMatchObject({ code: "invalid_nesting" });
    await expect(make({ parentId: projectId, tasks: [{ title: "Nope", subtasks: [] }] })).rejects.toMatchObject({ code: "invalid_nesting" });
  });

  it("refuses an assignee from outside the workspace, an archived parent, and people without access", async () => {
    await expect(make({ parentId: epicId, tasks: [{ title: "x", subtasks: [] }], assigneeId: outsider })).rejects.toMatchObject({ code: "invalid_assignee" });
    const dead = (await transact(owner, (ctx) => createNode(ctx, { parentId: projectId, type: "EPIC", title: "Old" }))).result.id;
    await raw.node.update({ where: { id: dead }, data: { archivedAt: new Date() } });
    await expect(make({ parentId: dead, tasks: [{ title: "x", subtasks: [] }] })).rejects.toMatchObject({ code: "parent_archived" });
    await expect(transact(outsider, (ctx) => createTaskTree(ctx, { parentId: epicId, tasks: [{ title: "x", subtasks: [] }] }))).rejects.toMatchObject({ status: 404 });
  });

  it("the schema keeps the list within bounds", () => {
    const task = (n: number) => ({ title: "t", subtasks: Array.from({ length: n }, () => "s") });
    expect(createTaskTreeSchema.safeParse({ parentId: "p", tasks: [task(30)] }).success).toBe(true);
    expect(createTaskTreeSchema.safeParse({ parentId: "p", tasks: [] }).success).toBe(false);
    expect(createTaskTreeSchema.safeParse({ parentId: "p", tasks: [task(31)] }).success).toBe(false);
    expect(createTaskTreeSchema.safeParse({ parentId: "p", tasks: Array.from({ length: 41 }, () => task(0)) }).success).toBe(false);
    expect(createTaskTreeSchema.safeParse({ parentId: "p", tasks: Array.from({ length: 4 }, () => task(30)) }).success).toBe(false); // 124 items
    expect(createTaskTreeSchema.safeParse({ parentId: "p", tasks: [{ title: "  ", subtasks: [] }] }).success).toBe(false);
  });
});

describe("My tasks shows a big task with its branch of small ones", () => {
  const NOW = new Date("2026-11-03T12:00:00.000Z");

  it("puts the subtasks inside their task, not as separate rows", async () => {
    const l = await listMyTasks(owner, ws.id, NOW);
    const all = [...l.overdue, ...l.today, ...l.upcoming, ...l.later];
    const task = all.find((t) => t.title === "Prepare the launch");
    expect(task?.subtasks.map((s) => [s.title, s.status, s.mine])).toEqual([
      ["Write the announcement", "TODO", true],
      ["Book the venue", "TODO", true],
    ]);
    expect(all.map((t) => t.title)).not.toContain("Book the venue");
    expect(all.some((t) => t.type === "SUBTASK" && t.parentTitle === null && t.title === "Write the announcement")).toBe(false);
  });

  it("a subtask finished stays in its task, marked done", async () => {
    const task = (await raw.node.findFirstOrThrow({ where: { title: "Prepare the launch" } })).id;
    const sub = (await raw.node.findFirstOrThrow({ where: { parentId: task, title: "Book the venue" } })).id;
    await raw.node.update({ where: { id: sub }, data: { status: "DONE", progress: 100 } });
    const l = await listMyTasks(owner, ws.id, NOW);
    const row = [...l.overdue, ...l.today, ...l.upcoming, ...l.later].find((t) => t.id === task);
    expect(row?.subtasks.find((s) => s.id === sub)?.status).toBe("DONE");
    // The Done tab lists what I finished, so it also appears there, saying which task it belongs to.
    expect(l.done.find((t) => t.id === sub)).toMatchObject({ type: "SUBTASK", parentTitle: "Prepare the launch" });
  });

  it("subtasks of a task that is somebody else's stand on their own and name their task", async () => {
    const theirs = await make({ parentId: epicId, tasks: [{ title: "Member's task", subtasks: ["Mine inside it"] }], assigneeId: member });
    await raw.node.update({ where: { id: theirs.result.tasks[0]!.subtasks[0]!.id }, data: { assigneeId: owner } });
    const l = await listMyTasks(owner, ws.id, NOW);
    const row = [...l.overdue, ...l.today, ...l.upcoming, ...l.later].find((t) => t.title === "Mine inside it");
    expect(row).toMatchObject({ type: "SUBTASK", parentTitle: "Member's task" });
    // and the member sees the whole branch, with the owner named on the part that is not theirs
    const m = await listMyTasks(member, ws.id, NOW);
    const task = [...m.overdue, ...m.today, ...m.upcoming, ...m.later].find((t) => t.title === "Member's task");
    expect(task?.subtasks).toEqual([expect.objectContaining({ title: "Mine inside it", mine: false, assignee: "Owner" })]);
  });
});

describe("the same thing through the public API and for Claude", () => {
  it("POST /nodes/task-tree creates the list for a token that may write, and not for a read-only one", async () => {
    const write = (await createToken(owner, ws.id, { name: "w", scope: "write", expiresInDays: 30 })).token;
    const read = (await createToken(owner, ws.id, { name: "r", scope: "read", expiresInDays: 30 })).token;
    const body = { parentId: epicId, tasks: [{ title: "Via API", subtasks: ["One", "Two"] }] };
    const call = (token: string) => dispatch("POST", "/nodes/task-tree", new URLSearchParams(), new Headers({ authorization: `Bearer ${token}` }), async () => body);
    expect((await call(read)).status).toBe(403);
    const ok = await call(write);
    expect(ok.status).toBe(201);
    expect((ok.body as { data: { tasks: { title: string; subtasks: unknown[] }[] } }).data.tasks[0]).toMatchObject({ title: "Via API" });
    expect(await raw.node.count({ where: { parentId: epicId, title: "Via API" } })).toBe(1);
  });

  it("is offered to Claude as one tool, create_tasks, to the connections that may write", async () => {
    const { TOOLS } = await import("@/server/mcp/tools");
    const tool = TOOLS.find((t) => t.name === "create_tasks");
    expect(tool).toMatchObject({ readOnly: false });
    expect(tool?.inputSchema).toMatchObject({ required: expect.arrayContaining(["parentId", "tasks"]) });
  });
});
