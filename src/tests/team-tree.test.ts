import { describe, expect, it } from "vitest";
import { cleanHeat, DEFAULT_HEAT, filterTree, heatOf, NO_MAP_FILTERS, sliceTree } from "@/modules/crm/team-tree";

const NOW = new Date("2026-11-10T12:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

describe("heatOf", () => {
  it("is green within 3 days, yellow up to 7, red after", () => {
    expect(heatOf(ago(1), ago(90), NOW)).toBe("green");
    expect(heatOf(ago(3), ago(90), NOW)).toBe("green");
    expect(heatOf(ago(5), ago(90), NOW)).toBe("yellow");
    expect(heatOf(ago(7), ago(90), NOW)).toBe("yellow");
    expect(heatOf(ago(8), ago(90), NOW)).toBe("red");
  });
  it("makes a newcomer with no work red only after a week", () => {
    expect(heatOf(null, ago(3), NOW)).toBe("yellow");
    expect(heatOf(null, ago(8), NOW)).toBe("red");
  });
  it("follows the thresholds that were set", () => {
    const s = { greenDays: 1, yellowDays: 2, newcomerDays: 30 };
    expect(heatOf(ago(2), ago(90), NOW, s)).toBe("yellow");
    expect(heatOf(ago(3), ago(90), NOW, s)).toBe("red");
    expect(heatOf(null, ago(20), NOW, s)).toBe("yellow");
  });
});

describe("cleanHeat", () => {
  it("falls back to the defaults and keeps yellow after green", () => {
    expect(cleanHeat(null)).toEqual(DEFAULT_HEAT);
    expect(cleanHeat({ greenDays: 10, yellowDays: 4, newcomerDays: "x" })).toEqual({ greenDays: 10, yellowDays: 11, newcomerDays: 7 });
    expect(cleanHeat({ greenDays: 0, yellowDays: 999, newcomerDays: 500 })).toEqual({ greenDays: 1, yellowDays: 90, newcomerDays: 90 });
  });
});

const tree = [
  { id: "a", parentId: null },
  { id: "b", parentId: "a" },
  { id: "c", parentId: "b" },
  { id: "d", parentId: "c" },
  { id: "e", parentId: null },
];

describe("sliceTree", () => {
  it("opens the asked number of levels and marks the cut branches", () => {
    const r = sliceTree(tree, null, 2);
    expect(r.map((x) => [x.node.id, x.level, x.hasMore])).toEqual([
      ["a", 1, false],
      ["b", 2, true],
      ["e", 1, false],
    ]);
  });
  it("starts from a given partner", () => {
    expect(sliceTree(tree, "b", 1).map((x) => [x.node.id, x.level, x.hasMore])).toEqual([["c", 1, true]]);
  });
  it("survives a loop in the data", () => {
    const loop = [
      { id: "x", parentId: "y" },
      { id: "y", parentId: "x" },
    ];
    expect(sliceTree(loop, "x", 5).length).toBeLessThanOrEqual(2);
  });
});

describe("filterTree", () => {
  const nodes = [
    { id: "a", parentId: null, level: 1, city: "Warsaw", heat: "green" as const },
    { id: "b", parentId: "a", level: 2, city: "Kyiv", heat: "red" as const },
    { id: "c", parentId: "b", level: 3, city: "kyiv ", heat: "green" as const },
    { id: "e", parentId: null, level: 1, city: null, heat: "yellow" as const },
  ];
  it("keeps everything without filters", () => {
    expect(filterTree(nodes, NO_MAP_FILTERS).every((x) => !x.path)).toBe(true);
    expect(filterTree(nodes, NO_MAP_FILTERS)).toHaveLength(4);
  });
  it("keeps the way up to a match, marked as only a path", () => {
    const r = filterTree(nodes, { ...NO_MAP_FILTERS, city: "Kyiv" });
    expect(r.map((x) => [x.node.id, x.path])).toEqual([
      ["a", true],
      ["b", false],
      ["c", false],
    ]);
  });
  it("filters by colour and level", () => {
    expect(filterTree(nodes, { ...NO_MAP_FILTERS, heat: "red" }).map((x) => x.node.id)).toEqual(["a", "b"]);
    expect(filterTree(nodes, { ...NO_MAP_FILTERS, level: 1 }).map((x) => x.node.id)).toEqual(["a", "e"]);
  });
});
