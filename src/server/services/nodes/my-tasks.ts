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
}

/**
 * The signed-in person's to-do list across all projects they can reach, sorted into the groups people think in:
 * overdue, today, the next seven days, later (or without a date), and what was finished lately.
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
  const select = { id: true, title: true, type: true, status: true, dueDate: true, progress: true, health: true, rootId: true } as const;

  const [open, done] = await Promise.all([
    db.node.findMany({ where: { ...base, status: { notIn: ["DONE", "CANCELLED"] }, progress: { lt: 100 } }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { position: "asc" }], take: 500, select }),
    db.node.findMany({ where: { ...base, OR: [{ status: "DONE" }, { progress: { gte: 100 } }], NOT: { status: "CANCELLED" } }, orderBy: { updatedAt: "desc" }, take: 30, select }),
  ]);
  const roots = [...new Set([...open, ...done].map((t) => t.rootId).filter((x): x is string => !!x))];
  const titles = new Map((await db.node.findMany({ where: { id: { in: roots } }, select: { id: true, title: true } })).map((p) => [p.id, p.title]));
  const row = (t: (typeof open)[number]): MyTask => ({ id: t.id, title: t.title, type: t.type, status: t.status, dueDate: t.dueDate, progress: t.progress, health: t.health, projectId: t.rootId, projectTitle: t.rootId ? (titles.get(t.rootId) ?? null) : null });

  const due = (t: (typeof open)[number]) => t.dueDate;
  return {
    timeZone,
    overdue: open.filter((t) => due(t) && (due(t) as Date) < start).map(row),
    today: open.filter((t) => due(t) && (due(t) as Date) >= start && (due(t) as Date) < tomorrow).map(row),
    upcoming: open.filter((t) => due(t) && (due(t) as Date) >= tomorrow && (due(t) as Date) < weekEnd).map(row),
    later: open.filter((t) => !due(t) || (due(t) as Date) >= weekEnd).map(row),
    done: done.map(row),
  };
}
