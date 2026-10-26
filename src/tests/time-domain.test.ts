import { describe, expect, it } from "vitest";
import { dayKey, formatMinutes, parseDuration, summarize, timerMinutes, weekDays, weekStart } from "@/modules/time/time";

const at = (s: string) => new Date(`${s}Z`);

describe("timerMinutes", () => {
  it("ignores accidental clicks and rounds to whole minutes", () => {
    expect(timerMinutes(at("2026-10-26T10:00:00"), at("2026-10-26T10:00:20"))).toBe(0);
    expect(timerMinutes(at("2026-10-26T10:00:00"), at("2026-10-26T10:00:40"))).toBe(1);
    expect(timerMinutes(at("2026-10-26T10:00:00"), at("2026-10-26T10:25:29"))).toBe(25);
    expect(timerMinutes(at("2026-10-26T10:00:00"), at("2026-10-26T10:25:31"))).toBe(26);
  });
  it("caps a forgotten timer at one day", () => {
    expect(timerMinutes(at("2026-10-20T10:00:00"), at("2026-10-26T10:00:00"))).toBe(1440);
  });
});

describe("weeks", () => {
  it("starts on Monday, UTC", () => {
    expect(weekStart(at("2026-10-28T15:00:00")).toISOString()).toBe("2026-10-26T00:00:00.000Z"); // Wednesday
    expect(weekStart(at("2026-11-01T23:59:00")).toISOString()).toBe("2026-10-26T00:00:00.000Z"); // Sunday
    expect(weekStart(at("2026-10-26T00:00:00")).toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(weekDays(weekStart(at("2026-10-28T00:00:00"))).map(dayKey)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  });
});

describe("durations", () => {
  it.each([
    ["90", 90],
    ["1:30", 90],
    ["1h30m", 90],
    ["1h 30m", 90],
    ["1.5h", 90],
    ["1,5h", 90],
    ["2h", 120],
    ["45m", 45],
    ["45 min", 45],
    [" 0:05 ", 5],
  ])("parses %s", (input, expected) => expect(parseDuration(input)).toBe(expected));
  it.each(["", "abc", "0", "-5", "25h", "1:75", "1h99m"])("rejects %j", (input) => expect(parseDuration(input)).toBeNull());
  it("formats minutes for people", () => {
    expect([formatMinutes(5), formatMinutes(60), formatMinutes(90), formatMinutes(125)]).toEqual(["5m", "1h", "1h 30m", "2h 5m"]);
  });
});

describe("summarize", () => {
  const e = (minutes: number, billable: boolean, userId: string, projectId: string, date: string) => ({ minutes, billable, userId, projectId, date: at(`${date}T00:00:00`) });
  const entries = [e(60, true, "ann", "p1", "2026-10-26"), e(30, true, "bob", "p1", "2026-10-26"), e(120, false, "ann", "p1", "2026-10-27"), e(90, true, "ann", "p2", "2026-10-27")];
  const rate = (x: { userId: string; projectId: string }) => (x.projectId === "p2" ? 100 : x.userId === "ann" ? 50 : 80);

  it("sums by project, counting money only for billable time", () => {
    const rows = summarize(entries, "project", rate);
    expect(rows).toEqual([
      { key: "p1", minutes: 210, billableMinutes: 90, amount: 90 }, // 1h×50 + 0.5h×80
      { key: "p2", minutes: 90, billableMinutes: 90, amount: 150 }, // project rate beats the person's
    ]);
  });
  it("groups by person and by day", () => {
    expect(summarize(entries, "user", rate).map((r) => [r.key, r.minutes, r.amount])).toEqual([["ann", 270, 200], ["bob", 30, 40]]);
    expect(summarize(entries, "day", rate).map((r) => [r.key, r.minutes])).toEqual([["2026-10-26", 90], ["2026-10-27", 210]]);
  });
  it("rounds once per group and copes with nothing", () => {
    expect(summarize([e(20, true, "ann", "p1", "2026-10-26"), e(20, true, "ann", "p1", "2026-10-26"), e(20, true, "ann", "p1", "2026-10-26")], "project", () => 33.33)[0]?.amount).toBe(33.33);
    expect(summarize([], "project", () => 1)).toEqual([]);
  });
});
