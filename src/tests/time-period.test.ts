import { describe, expect, it } from "vitest";
import { daysBetween, periodRange, shiftPeriod, splitByLocalDays } from "@/modules/time/period";

describe("periods", () => {
  it("finds the day, the week (Monday to Sunday) and the month around a day", () => {
    expect(periodRange("day", "2026-10-27")).toEqual({ from: "2026-10-27", to: "2026-10-27" });
    expect(periodRange("week", "2026-10-27")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(periodRange("week", "2026-11-01")).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(periodRange("week", "2026-11-02")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
    expect(periodRange("month", "2026-10-27")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(periodRange("month", "2026-12-05")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(periodRange("month", "2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(periodRange("all", "2026-10-27")).toBeNull();
  });
  it("lists the days of a range", () => {
    expect(daysBetween("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(daysBetween("2026-10-02", "2026-10-01")).toEqual([]);
  });
  it("steps back and forward by the period, keeping a month's day when it can", () => {
    expect(shiftPeriod("day", "2026-10-27", -1)).toBe("2026-10-26");
    expect(shiftPeriod("week", "2026-10-27", 1)).toBe("2026-11-03");
    expect(shiftPeriod("month", "2026-10-31", 1)).toBe("2026-11-30");
    expect(shiftPeriod("month", "2026-01-15", -1)).toBe("2025-12-15");
    expect(shiftPeriod("month", "2026-12-15", 1)).toBe("2027-01-15");
    expect(shiftPeriod("all", "2026-10-27", 3)).toBe("2026-10-27");
  });
});

describe("cutting time into days", () => {
  const d = (s: string) => new Date(s);
  it("keeps time inside one day on that day", () => {
    expect(splitByLocalDays(d("2026-10-27T09:00:00Z"), d("2026-10-27T10:30:00Z"), "UTC", 90)).toEqual([{ day: "2026-10-27", minutes: 90 }]);
  });
  it("splits a timer left running over midnight, and the parts add up to the whole", () => {
    const r = splitByLocalDays(d("2026-10-27T23:00:00Z"), d("2026-10-28T02:30:00Z"), "UTC", 210);
    expect(r).toEqual([{ day: "2026-10-27", minutes: 60 }, { day: "2026-10-28", minutes: 150 }]);
    const odd = splitByLocalDays(d("2026-10-27T23:59:20Z"), d("2026-10-28T00:00:50Z"), "UTC", 2);
    expect(odd.reduce((s, p) => s + p.minutes, 0)).toBe(2);
  });
  it("follows the person's zone, not UTC", () => {
    // 22:30 to 00:30 in Warsaw (UTC+1 in winter) is 21:30 to 23:30 UTC: it crosses Warsaw's midnight but not UTC's
    const r = splitByLocalDays(d("2026-11-10T21:30:00Z"), d("2026-11-10T23:30:00Z"), "Europe/Warsaw", 120);
    expect(r).toEqual([{ day: "2026-11-10", minutes: 90 }, { day: "2026-11-11", minutes: 30 }]);
  });
  it("covers several days and does nothing for no time", () => {
    const r = splitByLocalDays(d("2026-10-26T12:00:00Z"), d("2026-10-28T12:00:00Z"), "UTC", 2880);
    expect(r).toEqual([{ day: "2026-10-26", minutes: 720 }, { day: "2026-10-27", minutes: 1440 }, { day: "2026-10-28", minutes: 720 }]);
    expect(splitByLocalDays(d("2026-10-27T09:00:00Z"), d("2026-10-27T09:00:10Z"), "UTC", 0)).toEqual([]);
    expect(splitByLocalDays(d("2026-10-27T10:00:00Z"), d("2026-10-27T09:00:00Z"), "UTC", 5)).toEqual([]);
  });
});
