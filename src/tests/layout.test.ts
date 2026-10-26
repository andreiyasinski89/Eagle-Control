import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, tidyLayout } from "@/modules/nodes/layout";

const n = (id: string, parentId: string | null, position = 0) => ({ id, parentId, position });
const { nodeHeight: H, nodeWidth: W, gapX } = DEFAULT_LAYOUT;

describe("tidyLayout", () => {
  it("places depth on the x axis", () => {
    const l = tidyLayout([n("p", null), n("a", "p", 1)]);
    expect(l.get("p")?.x).toBe(0);
    expect(l.get("a")?.x).toBe(W + gapX);
  });

  it("keeps sibling order by position, not insertion order", () => {
    const l = tidyLayout([n("p", null), n("b", "p", 2), n("a", "p", 1), n("c", "p", 3)]);
    expect(l.get("a")!.y).toBeLessThan(l.get("b")!.y);
    expect(l.get("b")!.y).toBeLessThan(l.get("c")!.y);
  });

  it("centres a parent on its children", () => {
    const l = tidyLayout([n("p", null), n("a", "p", 1), n("b", "p", 2), n("c", "p", 3)]);
    expect(l.get("p")!.y).toBeCloseTo(l.get("b")!.y);
  });

  it("never overlaps nodes in the same column", () => {
    const nodes = [n("p", null)];
    for (let i = 0; i < 6; i++) {
      nodes.push(n(`e${i}`, "p", i));
      for (let j = 0; j < 1 + (i % 3); j++) nodes.push(n(`t${i}-${j}`, `e${i}`, j));
    }
    const l = tidyLayout(nodes);
    const byX = new Map<number, number[]>();
    for (const p of l.values()) byX.set(p.x, [...(byX.get(p.x) ?? []), p.y]);
    for (const ys of byX.values()) {
      ys.sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) expect(ys[i]! - ys[i - 1]!).toBeGreaterThanOrEqual(H);
    }
  });

  it("lays out orphans as extra roots and handles 2000 nodes quickly", () => {
    expect(tidyLayout([n("x", "missing")]).get("x")?.depth).toBe(0);
    const big = [n("p", null)];
    for (let i = 0; i < 40; i++) {
      big.push(n(`e${i}`, "p", i));
      for (let j = 0; j < 49; j++) big.push(n(`t${i}-${j}`, `e${i}`, j));
    }
    const t0 = performance.now();
    const l = tidyLayout(big);
    expect(l.size).toBe(big.length);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
