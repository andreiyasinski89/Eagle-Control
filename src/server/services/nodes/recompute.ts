import type { Health } from "@prisma/client";
import { computeTreeHealth, type HealthTreeNode } from "@/modules/nodes/health";
import { computeProgress, type ProgressNode } from "@/modules/nodes/progress";
import type { Tx } from "./access";

export interface Change {
  id: string;
  progress: number;
  health: Health;
}

/** Everything the pure rules need for one project, with Decimal estimation turned into number. */
export async function loadProjectRows(tx: Tx, projectId: string) {
  const rows = await tx.node.findMany({
    where: { archivedAt: null, OR: [{ id: projectId }, { rootId: projectId }] },
    select: {
      id: true,
      parentId: true,
      type: true,
      status: true,
      progress: true,
      progressMode: true,
      estimation: true,
      startDate: true,
      dueDate: true,
      assigneeId: true,
      healthOverride: true,
      health: true,
    },
  });
  return rows.map((r) => ({ ...r, estimation: r.estimation === null ? null : Number(r.estimation) }));
}

/** Ids that currently have an unfinished node blocking them. */
export async function blockedIds(tx: Tx, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const links = await tx.nodeLink.findMany({
    where: {
      kind: "BLOCKS",
      toNodeId: { in: [...ids] },
      from: { archivedAt: null, status: { notIn: ["DONE", "CANCELLED"] }, progress: { lt: 100 } },
    },
    select: { toNodeId: true },
  });
  return new Set(links.map((l) => l.toNodeId));
}

export function evaluate(
  rows: Awaited<ReturnType<typeof loadProjectRows>>,
  blocked: ReadonlySet<string>,
  today: Date,
): Map<string, Change> {
  const progress = computeProgress(rows satisfies ProgressNode[]);
  const withProgress: HealthTreeNode[] = rows.map((r) => ({
    ...r,
    progress: progress.get(r.id) ?? r.progress,
    hasActiveBlocker: blocked.has(r.id),
  }));
  const health = computeTreeHealth(withProgress, today);
  const out = new Map<string, Change>();
  for (const r of withProgress) out.set(r.id, { id: r.id, progress: r.progress, health: health.get(r.id) ?? "GREEN" });
  return out;
}

/** Recomputes progress + health for a whole project and persists what changed. */
export async function recomputeProject(tx: Tx, projectId: string, today = new Date()): Promise<Change[]> {
  const rows = await loadProjectRows(tx, projectId);
  const blocked = await blockedIds(tx, rows.map((r) => r.id));
  const next = evaluate(rows, blocked, today);

  const changed: Change[] = [];
  for (const r of rows) {
    const n = next.get(r.id);
    if (n && (n.progress !== r.progress || n.health !== r.health)) changed.push(n);
  }
  for (const c of changed) {
    await tx.node.update({ where: { id: c.id }, data: { progress: c.progress, health: c.health } });
  }
  return changed;
}
