import { z } from "zod";
import type { Health, NodeStatus, NodeType } from "@prisma/client";

export const filterCriteriaSchema = z.object({
  q: z.string().trim().max(200).optional(),
  statuses: z.array(z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"])).default([]),
  types: z
    .array(z.enum(["PROJECT", "EPIC", "SPRINT", "TASK", "SUBTASK", "DOCUMENT", "EVENT"]))
    .default([]),
  assigneeIds: z.array(z.string()).default([]),
  tagIds: z.array(z.string()).default([]),
  healths: z.array(z.enum(["GREEN", "YELLOW", "RED"])).default([]),
  due: z.enum(["overdue", "this_week", "next_week"]).nullable().default(null),
});

export type FilterCriteria = z.infer<typeof filterCriteriaSchema>;

export const EMPTY_FILTER: FilterCriteria = filterCriteriaSchema.parse({});

export interface FilterableNode {
  title: string;
  type: NodeType;
  status: NodeStatus;
  health: Health;
  progress: number;
  assigneeId: string | null;
  dueDate: Date | null;
  tagIds: readonly string[];
}

export function isEmptyFilter(c: FilterCriteria): boolean {
  return (
    !c.q &&
    c.statuses.length === 0 &&
    c.types.length === 0 &&
    c.assigneeIds.length === 0 &&
    c.tagIds.length === 0 &&
    c.healths.length === 0 &&
    c.due === null
  );
}

const DAY = 86_400_000;

/** Monday 00:00 UTC of the week containing `d`. */
function weekStart(d: Date): number {
  const day = Math.floor(d.getTime() / DAY) * DAY;
  const dow = (new Date(day).getUTCDay() + 6) % 7; // Monday = 0
  return day - dow * DAY;
}

export function matchesFilter(node: FilterableNode, c: FilterCriteria, now: Date): boolean {
  if (c.q && !node.title.toLowerCase().includes(c.q.toLowerCase())) return false;
  if (c.statuses.length && !c.statuses.includes(node.status)) return false;
  if (c.types.length && !(c.types as NodeType[]).includes(node.type)) return false;
  if (c.healths.length && !c.healths.includes(node.health)) return false;
  if (c.assigneeIds.length && (node.assigneeId === null || !c.assigneeIds.includes(node.assigneeId))) return false;
  if (c.tagIds.length && !c.tagIds.some((t) => node.tagIds.includes(t))) return false;

  if (c.due) {
    if (!node.dueDate) return false;
    const due = Math.floor(node.dueDate.getTime() / DAY) * DAY;
    const today = Math.floor(now.getTime() / DAY) * DAY;
    const week = weekStart(now);
    if (c.due === "overdue" && !(due < today && node.progress < 100)) return false;
    if (c.due === "this_week" && !(due >= week && due < week + 7 * DAY)) return false;
    if (c.due === "next_week" && !(due >= week + 7 * DAY && due < week + 14 * DAY)) return false;
  }
  return true;
}
