import { describe, expect, it } from "vitest";
import { average, buildPoints, periodRange, trend, weekStart, type DayRow } from "@/modules/crm/day-history";

const row = (day: string, efficiency: number | null, productivity: number | null): DayRow => ({
  day,
  planned: 4,
  done: 2,
  tasks: { planned: 2, done: 1 },
  meetings: { planned: 1, done: 1 },
  followUps: { planned: 1, done: 0 },
  backlogOpen: 0,
  backlogCleared: 0,
  trackedMinutes: 0,
  efficiency,
  productivity,
});

describe("weekStart", () => {
  it("is the Monday of the week", () => {
    expect(weekStart("2026-11-04")).toBe("2026-11-02"); // Wednesday
    expect(weekStart("2026-11-02")).toBe("2026-11-02");
    expect(weekStart("2026-11-08")).toBe("2026-11-02"); // Sunday
  });
});

describe("periodRange", () => {
  const today = "2026-11-04"; // a Wednesday
  it("yesterday is one day, set against the day before", () => {
    expect(periodRange("yesterday", today, null)).toEqual({ from: "2026-11-03", to: "2026-11-03", prev: { from: "2026-11-02", to: "2026-11-02" }, bucket: "day" });
  });
  it("this week is from Monday to today, set against the whole week before", () => {
    expect(periodRange("week", today, null)).toEqual({ from: "2026-11-02", to: today, prev: { from: "2026-10-26", to: "2026-11-01" }, bucket: "day" });
  });
  it("30 days end today, and the 30 before them are the comparison", () => {
    const r = periodRange("30d", today, null);
    expect(r.from).toBe("2026-10-06");
    expect(r.prev).toEqual({ from: "2026-09-06", to: "2026-10-05" });
  });
  it("a year goes by weeks", () => {
    const r = periodRange("year", today, null);
    expect(r.bucket).toBe("week");
    expect(r.from).toBe("2025-11-05");
  });
  it("everything starts at the oldest saved day, by days while it is short and by weeks when it is long", () => {
    expect(periodRange("all", today, "2026-10-20")).toMatchObject({ from: "2026-10-20", bucket: "day", prev: null });
    expect(periodRange("all", today, "2026-01-10").bucket).toBe("week");
    expect(periodRange("all", today, null).from).toBe(today);
  });
});

describe("average and trend", () => {
  it("averages the saved days and does not count a day without a score as zero", () => {
    expect(average([row("2026-11-01", 50, 40), row("2026-11-02", 100, 60), row("2026-11-03", null, null)])).toEqual({ efficiency: 75, productivity: 50, days: 3 });
    expect(average([])).toEqual({ efficiency: null, productivity: null, days: 0 });
  });
  it("tells better, worse and the same, and nothing without both sides", () => {
    expect(trend(80, 60)).toBe("up");
    expect(trend(60, 80)).toBe("down");
    expect(trend(60, 61)).toBe("same");
    expect(trend(60, null)).toBeNull();
    expect(trend(null, 60)).toBeNull();
  });
});

describe("buildPoints", () => {
  it("makes a point for every day, empty where nothing was saved", () => {
    const r = periodRange("week", "2026-11-04", null);
    const pts = buildPoints([row("2026-11-02", 50, 40), row("2026-11-04", 80, 70), row("2026-10-30", 10, 10)], r);
    expect(pts.map((p) => [p.from, p.efficiency, p.days])).toEqual([
      ["2026-11-02", 50, 1],
      ["2026-11-03", null, 0],
      ["2026-11-04", 80, 1],
    ]);
  });
  it("makes a point for every week with the average of its saved days", () => {
    const r = { from: "2026-10-28", to: "2026-11-10", prev: null, bucket: "week" as const };
    const pts = buildPoints([row("2026-10-28", 40, 30), row("2026-10-30", 60, 50), row("2026-11-03", 90, 80)], r);
    expect(pts.map((p) => [p.from, p.to, p.efficiency, p.productivity, p.days])).toEqual([
      ["2026-10-28", "2026-11-01", 50, 40, 2],
      ["2026-11-02", "2026-11-08", 90, 80, 1],
      ["2026-11-09", "2026-11-10", null, null, 0],
    ]);
  });
});
