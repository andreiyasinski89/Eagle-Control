export interface LayoutInput {
  id: string;
  parentId: string | null;
  position: number;
}

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  gapX: number;
  gapY: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = { nodeWidth: 240, nodeHeight: 76, gapX: 70, gapY: 18 };

/** About this many letters of a card title fit on one line of a 240px card (14px font, after the icon and the dot). Kept low on purpose: a line too many is fine, a cut title is not. */
export const TITLE_CHARS_PER_LINE = 22;
export const TITLE_LINE_PX = 20;
export const MAX_TITLE_LINES = 5;

/** How many lines a card title takes, at least one, at most MAX_TITLE_LINES (beyond that the card shows "…" and the full title on hover). */
export function titleLines(title: string): number {
  const words = title.trim().split(/\s+/).filter(Boolean);
  let lines = 1;
  let used = 0;
  for (const w of words) {
    const len = w.length;
    if (used === 0) used = len;
    else if (used + 1 + len <= TITLE_CHARS_PER_LINE) used += 1 + len;
    else {
      lines++;
      used = len;
    }
    while (used > TITLE_CHARS_PER_LINE) {
      lines++;
      used -= TITLE_CHARS_PER_LINE;
    }
  }
  return Math.min(MAX_TITLE_LINES, Math.max(1, lines));
}

/** The height of a map card: the usual card, plus a line of room for each extra line of its title. */
export const cardHeight = (title: string, opts: LayoutOptions = DEFAULT_LAYOUT): number => opts.nodeHeight + (titleLines(title) - 1) * TITLE_LINE_PX;

export interface Placed {
  x: number;
  y: number;
  depth: number;
}

/**
 * Left-to-right tidy tree. Siblings keep their `position` order (unlike a generic graph
 * layout), every subtree gets its own vertical slot, and a parent is centred on its children.
 * O(n); nodes whose parent is missing are laid out as extra roots.
 */
export function tidyLayout<T extends LayoutInput>(nodes: readonly T[], opts: LayoutOptions = DEFAULT_LAYOUT, heightOf?: (n: T) => number): Map<string, Placed> {
  const ids = new Set(nodes.map((n) => n.id));
  const kids = new Map<string | null, T[]>();
  for (const n of nodes) {
    const key = n.parentId !== null && ids.has(n.parentId) ? n.parentId : null;
    const list = kids.get(key);
    if (list) list.push(n);
    else kids.set(key, [n]);
  }
  for (const list of kids.values()) list.sort((a, b) => a.position - b.position);

  const { nodeHeight, nodeWidth, gapX, gapY } = opts;
  const slot = new Map<string, number>();
  // Each card may be taller than the usual one (a long title): its own height counts for its slot and for centring it.
  const own = (n: T) => Math.max(nodeHeight, heightOf?.(n) ?? nodeHeight);

  // Iterative post-order so 2000-deep chains cannot blow the stack.
  const order: T[] = [];
  const stack = [...(kids.get(null) ?? [])];
  while (stack.length) {
    const n = stack.pop() as T;
    order.push(n);
    stack.push(...(kids.get(n.id) ?? []));
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i] as T;
    const children = kids.get(n.id) ?? [];
    const childrenHeight = children.reduce((s, c) => s + (slot.get(c.id) ?? nodeHeight), 0) + Math.max(0, children.length - 1) * gapY;
    slot.set(n.id, Math.max(own(n), childrenHeight));
  }

  const out = new Map<string, Placed>();
  const place = (list: readonly T[], top: number, depth: number): void => {
    let cursor = top;
    for (const n of list) {
      const h = slot.get(n.id) ?? nodeHeight;
      out.set(n.id, { x: depth * (nodeWidth + gapX), y: cursor + h / 2 - own(n) / 2, depth });
      const children = kids.get(n.id) ?? [];
      if (children.length) {
        const total = children.reduce((s, c) => s + (slot.get(c.id) ?? nodeHeight), 0) + (children.length - 1) * gapY;
        place(children, cursor + (h - total) / 2, depth + 1);
      }
      cursor += h + gapY;
    }
  };
  // Recursion depth equals tree depth (≤ 4 levels by the nesting rules), so this is safe.
  place(kids.get(null) ?? [], 0, 0);
  return out;
}
