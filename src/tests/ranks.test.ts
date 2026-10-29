import { describe, expect, it } from "vitest";
import { cleanRanks, cleanState, emptyState, evaluateRank, type AutoValues, type Rank } from "@/modules/crm/ranks";

const ranks: Rank[] = [
  { id: "r1", name: "Silver", criteria: [{ id: "c1", label: "Clients", target: 10, auto: "clients" }] },
  {
    id: "r2",
    name: "Gold",
    criteria: [
      { id: "c2", label: "Partners", target: 4, auto: "partnersFirstLine" },
      { id: "c3", label: "Volume", target: 1000, auto: null },
    ],
  },
  { id: "r3", name: "Platinum", criteria: [{ id: "c4", label: "Team", target: 50, auto: "teamSize" }] },
];
const auto: AutoValues = { clients: 4, partnersFirstLine: 3, teamSize: 12, invitesMonth: 1 };

describe("cleanRanks", () => {
  it("drops nameless ranks and criteria, keeps order and makes unique ids", () => {
    const r = cleanRanks([
      { name: " A ", criteria: [{ label: "x", target: 0, auto: "nope" }, { label: "" }] },
      { name: "" },
      { id: "same", name: "B" },
      { id: "same", name: "C", criteria: [{ id: "same", label: "k", target: 5, auto: "clients" }] },
    ]);
    expect(r.map((x) => x.name)).toEqual(["A", "B", "C"]);
    expect(r[0]?.criteria).toEqual([{ id: "c1", label: "x", target: 1, auto: null }]);
    expect(new Set(r.map((x) => x.id)).size).toBe(3);
  });
  it("is empty for garbage", () => {
    expect(cleanRanks(null)).toEqual([]);
    expect(cleanRanks("x")).toEqual([]);
  });
});

describe("cleanState", () => {
  it("keeps only valid values", () => {
    expect(cleanState({ currentRankId: "r1", targetDate: "2026-12-01", manual: { c3: { value: 5.4, at: "2026-11-01T00:00:00.000Z" }, bad: { value: "x" } } })).toEqual({
      currentRankId: "r1",
      targetDate: "2026-12-01",
      manual: { c3: { value: 5, at: "2026-11-01T00:00:00.000Z" } },
    });
    expect(cleanState({ targetDate: "soon" }).targetDate).toBeNull();
  });
});

describe("evaluateRank", () => {
  it("aims at the first rank when none is chosen", () => {
    const s = evaluateRank(ranks, emptyState(), auto, "2026-11-10");
    expect(s.current).toBeNull();
    expect(s.next?.name).toBe("Silver");
    expect(s.criteria[0]).toMatchObject({ value: 4, percent: 40, left: 6, perDay: null });
    expect(s.percent).toBe(40);
  });

  it("aims at the rank after the current one and mixes counted and typed values", () => {
    const state = { currentRankId: "r1", targetDate: null, manual: { c3: { value: 500, at: "2026-11-05T00:00:00.000Z" } } };
    const s = evaluateRank(ranks, state, auto, "2026-11-10");
    expect(s.current?.name).toBe("Silver");
    expect(s.next?.name).toBe("Gold");
    expect(s.criteria.map((c) => [c.label, c.value, c.percent, c.updatedAt])).toEqual([
      ["Partners", 3, 75, null],
      ["Volume", 500, 50, "2026-11-05T00:00:00.000Z"],
    ]);
    expect(s.percent).toBe(63);
    expect(s.reached).toBe(false);
  });

  it("works out what a day has to bring up to the target day", () => {
    const state = { currentRankId: "r1", targetDate: "2026-11-20", manual: { c3: { value: 0, at: "2026-11-05T00:00:00.000Z" } } };
    const s = evaluateRank(ranks, state, auto, "2026-11-10");
    expect(s.daysLeft).toBe(10);
    expect(s.criteria.map((c) => c.perDay)).toEqual([0.1, 100]);
  });

  it("gives no per-day need after the target day, and a negative count", () => {
    const s = evaluateRank(ranks, { currentRankId: "r1", targetDate: "2026-11-01", manual: {} }, auto, "2026-11-10");
    expect(s.daysLeft).toBe(-9);
    expect(s.criteria.every((c) => c.perDay === null)).toBe(true);
  });

  it("knows when every criterion is met, and when the top is reached", () => {
    const met = evaluateRank(ranks, { currentRankId: "r2", targetDate: null, manual: {} }, { ...auto, teamSize: 60 }, "2026-11-10");
    expect(met).toMatchObject({ reached: true, percent: 100 });
    const top = evaluateRank(ranks, { currentRankId: "r3", targetDate: null, manual: {} }, auto, "2026-11-10");
    expect(top.next).toBeNull();
    expect(top.percent).toBe(100);
  });

  it("is empty without a ladder", () => {
    const s = evaluateRank([], emptyState(), auto, "2026-11-10");
    expect(s.next).toBeNull();
    expect(s.criteria).toEqual([]);
  });
});
