import { isEmptyFilter, matchesFilter, type FilterCriteria } from "@/modules/nodes/filters";
import { isCounting } from "@/modules/nodes/node-rules";
import type { ClientNode } from "./types";

export type FilterMode = "dim" | "hide";

export interface Visibility {
  visible: ClientNode[];
  /** Descendants hidden behind a collapsed node (counting types only), keyed by that node. */
  hiddenCounts: Map<string, number>;
  /** Ids matching the active filter, or null when no filter is set. */
  matches: Set<string> | null;
  childrenOf: Map<string, ClientNode[]>;
}

export function indexChildren(nodes: readonly ClientNode[]): Map<string, ClientNode[]> {
  const map = new Map<string, ClientNode[]>();
  for (const n of nodes) {
    if (n.parentId === null) continue;
    const list = map.get(n.parentId);
    if (list) list.push(n);
    else map.set(n.parentId, [n]);
  }
  for (const list of map.values()) list.sort((a, b) => a.position - b.position);
  return map;
}

export function descendantsOf(childrenOf: Map<string, ClientNode[]>, id: string): ClientNode[] {
  const out: ClientNode[] = [];
  const stack = [...(childrenOf.get(id) ?? [])];
  while (stack.length) {
    const n = stack.pop() as ClientNode;
    out.push(n);
    stack.push(...(childrenOf.get(n.id) ?? []));
  }
  return out;
}

/**
 * Which nodes are drawn. Collapsed branches are skipped (and counted), focus mode shows a single
 * subtree, and in "hide" filter mode non-matching nodes disappear unless they lead to a match.
 */
export function buildVisibility(
  nodes: readonly ClientNode[],
  opts: { rootId: string; focusId: string | null; filter: FilterCriteria; mode: FilterMode; now: Date },
): Visibility {
  const childrenOf = indexChildren(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const filtering = !isEmptyFilter(opts.filter);

  let matches: Set<string> | null = null;
  if (filtering) {
    matches = new Set();
    for (const n of nodes) {
      if (
        matchesFilter(
          {
            title: n.title,
            type: n.type,
            status: n.status,
            health: n.health,
            progress: n.progress,
            assigneeId: n.assigneeId,
            dueDate: n.dueDate ? new Date(n.dueDate) : null,
            tagIds: n.tagIds,
          },
          opts.filter,
          opts.now,
        )
      ) {
        matches.add(n.id);
      }
    }
  }

  // In hide mode keep ancestors of matches so the path stays readable.
  let keep: Set<string> | null = null;
  if (matches && opts.mode === "hide") {
    keep = new Set(matches);
    for (const id of matches) {
      let cur = byId.get(id)?.parentId ?? null;
      while (cur && !keep.has(cur)) {
        keep.add(cur);
        cur = byId.get(cur)?.parentId ?? null;
      }
    }
  }

  const start = byId.get(opts.focusId ?? opts.rootId) ?? byId.get(opts.rootId);
  const visible: ClientNode[] = [];
  const hiddenCounts = new Map<string, number>();
  if (start) {
    const stack = [start];
    while (stack.length) {
      const n = stack.pop() as ClientNode;
      if (keep && !keep.has(n.id)) continue;
      visible.push(n);
      const kids = childrenOf.get(n.id) ?? [];
      if (n.collapsed && kids.length) {
        hiddenCounts.set(n.id, descendantsOf(childrenOf, n.id).filter((d) => isCounting(d.type)).length);
      } else {
        for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i] as ClientNode);
      }
    }
  }
  return { visible, hiddenCounts, matches, childrenOf };
}
