import type { NodeStatus, NodeType, ProgressMode } from "@prisma/client";
import { isCounting } from "./node-rules";

export interface ProgressNode {
  id: string;
  parentId: string | null;
  type: NodeType;
  status: NodeStatus;
  progress: number;
  progressMode: ProgressMode;
  estimation: number | null;
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

function counts(n: ProgressNode): boolean {
  return isCounting(n.type) && n.status !== "CANCELLED";
}

export function childrenIndex<T extends { id: string; parentId: string | null }>(nodes: readonly T[]) {
  const map = new Map<string | null, T[]>();
  for (const n of nodes) {
    const list = map.get(n.parentId);
    if (list) list.push(n);
    else map.set(n.parentId, [n]);
  }
  return map;
}

/**
 * Progress for every node. Containers (project/epic/sprint) and AUTO tasks take the
 * estimation-weighted mean of their counting children; everything else keeps its own value.
 * Weights: own estimation, or the sum of descendants' for containers; unknown weights fall
 * back to the mean of known sibling weights, or 1 when nobody has an estimation.
 */
export function computeProgress(nodes: readonly ProgressNode[]): Map<string, number> {
  const byParent = childrenIndex(nodes);
  const result = new Map<string, number>();
  const weights = new Map<string, number | null>();

  const visit = (n: ProgressNode): void => {
    const kids = (byParent.get(n.id) ?? []).filter(counts);
    kids.forEach(visit);

    const manualTask = n.type === "TASK" && n.progressMode === "MANUAL";
    if (kids.length === 0 || manualTask) {
      result.set(n.id, clamp(n.progress));
      weights.set(n.id, n.estimation);
      return;
    }

    const known = kids.map((k) => weights.get(k.id) ?? null).filter((w): w is number => w !== null && w > 0);
    const fallback = known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : 1;
    let total = 0;
    let acc = 0;
    for (const k of kids) {
      const w = weights.get(k.id) ?? fallback;
      const weight = w > 0 ? w : fallback;
      total += weight;
      acc += weight * (result.get(k.id) ?? 0);
    }
    result.set(n.id, clamp(Math.round(acc / total)));
    weights.set(n.id, known.length > 0 ? kids.reduce((s, k) => s + (weights.get(k.id) ?? fallback), 0) : null);
  };

  for (const root of byParent.get(null) ?? []) visit(root);
  // Orphans (parent filtered out) are treated as roots of their own subtree.
  const ids = new Set(nodes.map((n) => n.id));
  for (const n of nodes) if (n.parentId !== null && !ids.has(n.parentId)) visit(n);
  return result;
}

/** Ids from `id` up to the root, nearest first (excluding `id`). */
export function ancestorIds(nodes: readonly { id: string; parentId: string | null }[], id: string): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const chain: string[] = [];
  let cur = byId.get(id)?.parentId ?? null;
  while (cur && !chain.includes(cur)) {
    chain.push(cur);
    cur = byId.get(cur)?.parentId ?? null;
  }
  return chain;
}
