import { describe, expect, it } from "vitest";
import { canMoveGroup, depthOf, descendantIds, groupTree, heightOf } from "@/modules/crm/groups";

const g = (id: string, parentId: string | null = null, name = id, position = 0) => ({ id, parentId, name, position });
const tree = [g("a"), g("b", "a"), g("c", "b"), g("d"), g("e", "d")];

describe("groups tree", () => {
  it("finds the group and everything below it", () => {
    expect(descendantIds(tree, "a").sort()).toEqual(["a", "b", "c"]);
    expect(descendantIds(tree, "c")).toEqual(["c"]);
  });
  it("measures depth and height", () => {
    expect(depthOf(tree, "a")).toBe(1);
    expect(depthOf(tree, "c")).toBe(3);
    expect(depthOf(tree, "zzz")).toBe(0);
    expect(heightOf(tree, "a")).toBe(3);
    expect(heightOf(tree, "d")).toBe(2);
  });
  it("refuses moves into itself, into its own subgroup and past three levels", () => {
    expect(canMoveGroup(tree, "a", "a")).toBe("self");
    expect(canMoveGroup(tree, "a", "c")).toBe("cycle");
    expect(canMoveGroup(tree, "d", "c")).toBe("too_deep");
    expect(canMoveGroup(tree, "c", "d")).toBe("ok");
    expect(canMoveGroup(tree, "c", null)).toBe("ok");
    expect(canMoveGroup(tree, "d", "a")).toBe("ok");
  });
  it("survives a corrupt cycle without hanging", () => {
    const bad = [g("x", "y"), g("y", "x")];
    expect(descendantIds(bad, "x").sort()).toEqual(["x", "y"]);
    expect(depthOf(bad, "x")).toBe(2);
    expect(heightOf(bad, "x")).toBeGreaterThan(0);
  });
  it("orders by position then name, an orphan counts as top level", () => {
    const t = groupTree([g("b", null, "Beta", 1), g("a", null, "Alpha", 1), g("z", null, "Zed", 0), g("o", "gone", "Orphan", 5), g("k", "a", "Kid", 0)]);
    expect(t.map((n) => n.group.id)).toEqual(["z", "a", "b", "o"]);
    expect(t[1]!.children.map((n) => [n.group.id, n.depth])).toEqual([["k", 2]]);
  });
});
