import { randomUUID } from "node:crypto";
import { ApiError } from "@/server/http/errors";
import { canNest } from "@/modules/nodes/node-rules";
import type { CreateTaskTreeInput } from "@/modules/nodes/schemas";
import { loadNode, logActivity } from "./access";
import { recordStatusChanges } from "./events";
import type { OpContext } from "./ops";
import { nodePath } from "../links";
import { notify } from "../notify";

const invalid = (code: string, message: string, details?: Record<string, unknown>) => new ApiError(422, code, message, details);

/**
 * Several tasks, each with its own subtasks, under one epic or sprint, written with a handful of statements
 * instead of several per node (the same lesson as the import: what is slow on a hosted database is the number of round trips).
 * Everything a single `createNode` would do is done once for the lot: the placement check, the status history,
 * the audit entries, the notification to the assignee and the recount of the project's progress.
 * Run it inside `transact`.
 */
export async function createTaskTree(ctx: OpContext, input: CreateTaskTreeInput): Promise<{ tasks: { id: string; title: string; subtasks: { id: string; title: string }[] }[] }> {
  const { tx, userId } = ctx;
  const parent = await loadNode(tx, userId, input.parentId, "node:write");
  if (parent.node.archivedAt) throw new ApiError(409, "parent_archived", "The parent is archived");
  if (!canNest(parent.node.type, "TASK")) throw invalid("invalid_nesting", `A TASK cannot be placed under a ${parent.node.type}`, { parentType: parent.node.type, type: "TASK" });
  if (input.assigneeId) {
    const m = await tx.membership.findUnique({ where: { userId_workspaceId: { userId: input.assigneeId, workspaceId: parent.node.workspaceId } } });
    if (!m || m.role === "CLIENT") throw invalid("invalid_assignee", "Assignee must be a member of the workspace");
  }

  const workspaceId = parent.node.workspaceId;
  const due = input.dueDate ? new Date(input.dueDate) : null;
  const last = await tx.node.aggregate({ where: { parentId: parent.node.id, archivedAt: null }, _max: { position: true } });
  const firstPosition = (last._max.position ?? 0) + 1024;

  const made = input.tasks.map((t, i) => ({ id: randomUUID(), title: t.title, position: firstPosition + i * 1024, subtasks: t.subtasks.map((title, k) => ({ id: randomUUID(), title, position: (k + 1) * 1024 })) }));
  const common = { workspaceId, rootId: parent.projectId, createdById: userId, assigneeId: input.assigneeId ?? null, dueDate: due, status: "TODO" as const, data: {} };

  await tx.node.createMany({
    data: [
      ...made.map((t) => ({ ...common, id: t.id, parentId: parent.node.id, type: "TASK" as const, title: t.title, position: t.position })),
      ...made.flatMap((t) => t.subtasks.map((s) => ({ ...common, id: s.id, parentId: t.id, type: "SUBTASK" as const, title: s.title, position: s.position }))),
    ],
  });
  const all = [...made.map((t) => ({ id: t.id, type: "TASK" as const, title: t.title, parentId: parent.node.id })), ...made.flatMap((t) => t.subtasks.map((s) => ({ id: s.id, type: "SUBTASK" as const, title: s.title, parentId: t.id })))];
  await recordStatusChanges(tx, all.map((n) => ({ nodeId: n.id, projectId: parent.projectId, type: n.type, from: null, to: "TODO" as const })), userId);
  await tx.activityLog.createMany({ data: all.map((n) => ({ workspaceId, nodeId: n.id, actorId: userId, action: "node.created", diff: { type: n.type, title: n.title, parentId: n.parentId } })) });
  if (input.assigneeId && input.assigneeId !== userId) {
    await notify({ userId: input.assigneeId, workspaceId, kind: "assigned", title: `You were assigned ${all.length} ${all.length === 1 ? "task" : "tasks"}`, url: nodePath(parent.node), payload: { nodeId: parent.node.id } }, tx);
  }
  await logActivity(tx, { workspaceId, nodeId: parent.node.id, actorId: userId, action: "tasks.created", diff: { tasks: made.length, subtasks: all.length - made.length } });
  ctx.touched.add(parent.projectId);

  return { tasks: made.map((t) => ({ id: t.id, title: t.title, subtasks: t.subtasks.map((s) => ({ id: s.id, title: s.title })) })) };
}
