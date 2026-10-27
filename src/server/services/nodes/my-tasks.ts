import type { NodeStatus } from "@prisma/client";
import { db } from "@/server/db";
import { isValidTimeZone, todayIn } from "@/modules/views/tz";
import { loadWorkspaceMember } from "./access";

const DAY = 86_400_000;

export interface MyTask {
  id: string;
  title: string;
  type: string;
  status: NodeStatus;
  dueDate: Date | null;
  progress: number;
  health: string;
  projectId: string | null;
  projectTitle: string | null;
  /** The small tasks under it, whoever they are assigned to. */
  subtasks: MySubtask[];
  /** The task this one belongs to, when it is a subtask shown on its own because its task is not mine. */
  parentTitle: string | null;
}

export interface MySubtask {
  id: string;
  title: string;
  status: NodeStatus;
  dueDate: Date | null;
  assignee: string | null;
  mine: boolean;
}

/**
 * The signed-in person's to-do list across all projects they can reach, sorted into the groups people think in:
 * overdue, today, the next seven days, later (or without a date), and what was finished lately. A task carries its
 * subtasks, so a big task shows its branch of small ones; a subtask of mine whose task is somebody else's stands on its own
 * and says which task it belongs to.
 * "Today" is the day in the person's own time zone; deadlines are dates, so they are matched by that date.
 */
export async function listMyTasks(userId: string, workspaceId: string, now = new Date()) {
  const membership = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const me = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const timeZone = me && isValidTimeZone(me.timezone) ? me.timezone : "UTC";
  const start = new Date(`${todayIn(timeZone, now)}T00:00:00.000Z`);
  const tomorrow = new Date(start.getTime() + DAY);
  const weekEnd = new Date(start.getTime() + 8 * DAY);

  let reachable: string[] | undefined;
  if (membership.role === "GUEST" || membership.role === "CLIENT") {
    reachable = (await db.projectMember.findMany({ where: { userId }, select: { nodeId: true } })).map((p) => p.nodeId);
  }
  const base = { workspaceId, assigneeId: userId, archivedAt: null, type: { in: ["TASK", "SUBTASK"] as ("TASK" | "SUBTASK")[] }, ...(reachable ? { rootId: { in: reachable } } : {}) };
  const select = { id: true, title: true, type: true, status: true, dueDate: true, progress: true, health: true, rootId: true, parentId: true } as const;

  const [open, done] = await Promise.all([
    db.node.findMany({ where: { ...base, status: { notIn: ["DONE", "CANCELLED"] }, progress: { lt: 100 } }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { position: "asc" }], take: 500, select }),
    db.node.findMany({ where: { ...base, OR: [{ status: "DONE" }, { progress: { gte: 100 } }], NOT: { status: "CANCELLED" } }, orderBy: { updatedAt: "desc" }, take: 30, select }),
  ]);
  const taskIds = [...open, ...done].filter((t) => t.type === "TASK").map((t) => t.id);
  const parentIds = [...new Set([...open, ...done].filter((t) => t.type === "SUBTASK" && t.parentId).map((t) => t.parentId as string))];
  const [children, parents] = await Promise.all([
    taskIds.length ? db.node.findMany({ where: { parentId: { in: taskIds }, type: "SUBTASK", archivedAt: null }, orderBy: { position: "asc" }, select: { id: true, parentId: true, title: true, status: true, dueDate: true, assignee: { select: { name: true, email: true } }, assigneeId: true } }) : [],
    parentIds.length ? db.node.findMany({ where: { id: { in: parentIds } }, select: { id: true, title: true } }) : [],
  ]);
  const roots = [...new Set([...open, ...done].map((t) => t.rootId).filter((x): x is string => !!x))];
  const titles = new Map((await db.node.findMany({ where: { id: { in: roots } }, select: { id: true, title: true } })).map((p) => [p.id, p.title]));
  const subtasksOf = new Map<string, MySubtask[]>();
  for (const c of children) subtasksOf.set(c.parentId as string, [...(subtasksOf.get(c.parentId as string) ?? []), { id: c.id, title: c.title, status: c.status, dueDate: c.dueDate, assignee: c.assignee ? (c.assignee.name ?? c.assignee.email) : null, mine: c.assigneeId === userId }]);
  const parentTitle = new Map(parents.map((p) => [p.id, p.title]));
  const openIds = new Set(open.map((t) => t.id));
  const doneIds = new Set(done.map((t) => t.id));
  const row = (t: (typeof open)[number]): MyTask => ({
    id: t.id,
    title: t.title,
    type: t.type,
    status: t.status,
    dueDate: t.dueDate,
    progress: t.progress,
    health: t.health,
    projectId: t.rootId,
    projectTitle: t.rootId ? (titles.get(t.rootId) ?? null) : null,
    subtasks: subtasksOf.get(t.id) ?? [],
    parentTitle: t.type === "SUBTASK" && t.parentId ? (parentTitle.get(t.parentId) ?? null) : null,
  });
  // A subtask of mine under a task of mine in the same list is shown inside that task, not a second time on its own.
  const standalone = (ids: Set<string>) => (t: (typeof open)[number]) => !(t.type === "SUBTASK" && t.parentId && ids.has(t.parentId));

  const due = (t: (typeof open)[number]) => t.dueDate;
  const top = open.filter(standalone(openIds));
  return {
    timeZone,
    overdue: top.filter((t) => due(t) && (due(t) as Date) < start).map(row),
    today: top.filter((t) => due(t) && (due(t) as Date) >= start && (due(t) as Date) < tomorrow).map(row),
    upcoming: top.filter((t) => due(t) && (due(t) as Date) >= tomorrow && (due(t) as Date) < weekEnd).map(row),
    later: top.filter((t) => !due(t) || (due(t) as Date) >= weekEnd).map(row),
    done: done.filter(standalone(doneIds)).map(row),
  };
}
