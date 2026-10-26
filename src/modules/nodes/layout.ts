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
export function tidyLayout(nodes: readonly LayoutInput[], opts: LayoutOptions = DEFAULT_LAYOUT): Map<string, Placed> {
  const ids = new Set(nodes.map((n) => n.id));
  const kids = new Map<string | null, LayoutInput[]>();
  for (const n of nodes) {
    const key = n.parentId !== null && ids.has(n.parentId) ? n.parentId : null;
    const list = kids.get(key);
    if (list) list.push(n);
    else kids.set(key, [n]);
  }
  for (const list of kids.values()) list.sort((a, b) => a.position - b.position);

  const { nodeHeight, nodeWidth, gapX, gapY } = opts;
  const slot = new Map<string, number>();

  // Iterative post-order so 2000-deep chains cannot blow the stack.
  const order: LayoutInput[] = [];
  const stack = [...(kids.get(null) ?? [])];
  while (stack.length) {
    const n = stack.pop() as LayoutInput;
    order.push(n);
    stack.push(...(kids.get(n.id) ?? []));
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const n = order[i] as LayoutInput;
    const children = kids.get(n.id) ?? [];
    const childrenHeight = children.reduce((s, c) => s + (slot.get(c.id) ?? nodeHeight), 0) + Math.max(0, children.length - 1) * gapY;
    slot.set(n.id, Math.max(nodeHeight, childrenHeight));
  }

  const out = new Map<string, Placed>();
  const place = (list: readonly LayoutInput[], top: number, depth: number): void => {
    let cursor = top;
    for (const n of list) {
      const h = slot.get(n.id) ?? nodeHeight;
      out.set(n.id, { x: depth * (nodeWidth + gapX), y: cursor + h / 2 - nodeHeight / 2, depth });
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
