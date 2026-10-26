import type { Health, NodeStatus, NodeType } from "@prisma/client";
import { childrenIndex } from "./progress";
import { isCounting } from "./node-rules";

export interface HealthNode {
  type: NodeType;
  status: NodeStatus;
  progress: number;
  startDate: Date | null;
  dueDate: Date | null;
  assigneeId: string | null;
  healthOverride: Health | null;
  /** An unfinished node with an active BLOCKS link points at this node. */
  hasActiveBlocker: boolean;
}

export interface HealthChild {
  type: NodeType;
  status: NodeStatus;
  health: Health;
}

const DAY = 86_400_000;
const RED_SHARE = 0.25;

/** Calendar day in UTC, so "today" does not flicker with the time of day. */
export function dayStart(d: Date): number {
  return Math.floor(d.getTime() / DAY) * DAY;
}

function finished(n: Pick<HealthNode, "status" | "progress">): boolean {
  return n.progress >= 100 || n.status === "DONE" || n.status === "CANCELLED";
}

function ownHealth(node: HealthNode, today: Date): Health {
  const now = dayStart(today);
  const due = node.dueDate ? dayStart(node.dueDate) : null;
  const start = node.startDate ? dayStart(node.startDate) : null;

  if (node.hasActiveBlocker) return "RED";
  if (due !== null && due < now) return "RED";

  let lag = 0;
  let timeLeftShare: number | null = null;
  if (due !== null && start !== null) {
    const total = due - start;
    const expected = total <= 0 ? (now >= due ? 100 : 0) : Math.max(0, Math.min(100, ((now - start) / total) * 100));
    lag = expected - node.progress;
    if (total > 0 && now >= start) timeLeftShare = (due - now) / total;
  }

  if (lag > 30) return "RED";
  if (timeLeftShare !== null && timeLeftShare <= 0.2 && node.progress < 70) return "YELLOW";
  if ((node.type === "TASK" || node.type === "SUBTASK") && node.assigneeId === null) return "YELLOW";
  if (lag >= 10) return "YELLOW";
  return "GREEN";
}

/**
 * Pure health rule set.
 *  1. manual override wins; 2. finished work is green;
 *  3. a parent turns red when more than 25% of its counting children are red;
 *  4. otherwise its own deadline / progress / blocker / assignee rules apply.
 */
export function computeHealth(node: HealthNode, children: readonly HealthChild[], today: Date): Health {
  if (node.healthOverride) return node.healthOverride;
  if (finished(node)) return "GREEN";

  const counted = children.filter((c) => isCounting(c.type) && c.status !== "CANCELLED");
  if (counted.length > 0) {
    const red = counted.filter((c) => c.health === "RED").length;
    if (red / counted.length > RED_SHARE) return "RED";
  }
  return ownHealth(node, today);
}

export interface HealthTreeNode extends HealthNode {
  id: string;
  parentId: string | null;
}

/** Health for every node, children before parents. */
export function computeTreeHealth(nodes: readonly HealthTreeNode[], today: Date): Map<string, Health> {
  const byParent = childrenIndex(nodes);
  const result = new Map<string, Health>();
  const visit = (n: HealthTreeNode): void => {
    const kids = byParent.get(n.id) ?? [];
    kids.forEach(visit);
    result.set(
      n.id,
      computeHealth(
        n,
        kids.map((k) => ({ type: k.type, status: k.status, health: result.get(k.id) ?? "GREEN" })),
        today,
      ),
    );
  };
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) if (n.parentId === null || !ids.has(n.parentId)) visit(n);
  return result;
}
