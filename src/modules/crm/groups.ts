/** Groups of people form a small tree: a group may hold subgroups, three levels deep at most. */
export const MAX_GROUP_DEPTH = 3;
export const GROUP_LIMIT = 200;
export const GROUP_COLORS = ["#7c3aed", "#2563eb", "#0891b2", "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#db2777"] as const;

export interface FlatGroup {
  id: string;
  parentId: string | null;
}

export function childrenIndex<T extends FlatGroup>(groups: T[]): Map<string | null, T[]> {
  const m = new Map<string | null, T[]>();
  for (const g of groups) m.set(g.parentId, [...(m.get(g.parentId) ?? []), g]);
  return m;
}

/** The group and everything below it. */
export function descendantIds(groups: FlatGroup[], id: string): string[] {
  const kids = childrenIndex(groups);
  const out: string[] = [];
  const seen = new Set<string>();
  const walk = (x: string) => {
    if (seen.has(x)) return;
    seen.add(x);
    out.push(x);
    for (const c of kids.get(x) ?? []) walk(c.id);
  };
  walk(id);
  return out;
}

/** 1 for a top-level group; 0 when the id is unknown. */
export function depthOf(groups: FlatGroup[], id: string): number {
  const by = new Map(groups.map((g) => [g.id, g]));
  let d = 0;
  let cur = by.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    d++;
    cur = cur.parentId ? by.get(cur.parentId) : undefined;
  }
  return d;
}

/** How many levels the subtree under (and including) `id` has. */
export function heightOf(groups: FlatGroup[], id: string): number {
  const kids = childrenIndex(groups);
  const h = (x: string, path: Set<string>): number => (path.has(x) ? 0 : 1 + Math.max(0, ...(kids.get(x) ?? []).map((c) => h(c.id, new Set([...path, x])))));
  return h(id, new Set());
}

export type MoveCheck = "ok" | "self" | "cycle" | "too_deep";

/** Can `id` go under `parentId` (null = top level)? Refuses moving a group into itself or its own subgroup, and trees deeper than three levels. */
export function canMoveGroup(groups: FlatGroup[], id: string, parentId: string | null): MoveCheck {
  if (parentId === id) return "self";
  if (parentId && descendantIds(groups, id).includes(parentId)) return "cycle";
  const base = parentId ? depthOf(groups, parentId) : 0;
  return base + heightOf(groups, id) > MAX_GROUP_DEPTH ? "too_deep" : "ok";
}

export interface GroupNode<T> {
  group: T;
  depth: number;
  children: GroupNode<T>[];
}

/** The tree in display order (by position, then name), ready to draw. */
export function groupTree<T extends FlatGroup & { name: string; position: number }>(groups: T[]): GroupNode<T>[] {
  const ids = new Set(groups.map((g) => g.id));
  const kids = childrenIndex(groups.map((g) => (g.parentId && !ids.has(g.parentId) ? { ...g, parentId: null } : g)));
  const build = (parent: string | null, depth: number): GroupNode<T>[] =>
    (kids.get(parent) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
      .map((g) => ({ group: g, depth, children: build(g.id, depth + 1) }));
  return build(null, 1);
}
