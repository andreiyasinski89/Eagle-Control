import { computeTreeHealth, type HealthTreeNode } from "@/modules/nodes/health";
import { computeProgress } from "@/modules/nodes/progress";
import type { Change, ClientNode } from "./types";

/**
 * Same pure rules the server uses, run in the browser so edits repaint instantly.
 * The server's answer (returned as `changes`) always wins afterwards.
 */
export function recomputeClient(nodes: readonly ClientNode[], today: Date): Change[] {
  const progress = computeProgress(
    nodes.map((n) => ({
      id: n.id,
      parentId: n.parentId,
      type: n.type,
      status: n.status,
      progress: n.progress,
      progressMode: n.progressMode,
      estimation: n.estimation,
    })),
  );
  const healthNodes: HealthTreeNode[] = nodes.map((n) => ({
    id: n.id,
    parentId: n.parentId,
    type: n.type,
    status: n.status,
    progress: progress.get(n.id) ?? n.progress,
    startDate: n.startDate ? new Date(n.startDate) : null,
    dueDate: n.dueDate ? new Date(n.dueDate) : null,
    assigneeId: n.assigneeId,
    healthOverride: n.healthOverride,
    hasActiveBlocker: n.blocked,
  }));
  const health = computeTreeHealth(healthNodes, today);
  return nodes.map((n) => ({
    id: n.id,
    progress: progress.get(n.id) ?? n.progress,
    health: health.get(n.id) ?? "GREEN",
  }));
}
