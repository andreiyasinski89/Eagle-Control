import { describe, expect, it } from "vitest";
import { addDays, cleanGoals, fillScript, progress, stepDate, weekBounds } from "@/modules/crm/tracker";

describe("the week", () => {
  it("runs Monday to Sunday in the person's zone", () => {
    // Wednesday 28 October 2026, noon UTC
    const w = weekBounds("UTC", new Date("2026-10-28T12:00:00Z"));
    expect(w).toMatchObject({ from: "2026-10-26", to: "2026-11-01" });
    expect(w.start.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });
  it("a Sunday belongs to the week that ends on it, a Monday starts the next", () => {
    expect(weekBounds("UTC", new Date("2026-11-01T23:00:00Z")).from).toBe("2026-10-26");
    expect(weekBounds("UTC", new Date("2026-11-02T00:30:00Z")).from).toBe("2026-11-02");
  });
  it("follows the local day, not the UTC day", () => {
    // 23:30 on Sunday 1 Nov in UTC is already Monday 2 Nov in Auckland
    const w = weekBounds("Pacific/Auckland", new Date("2026-11-01T23:30:00Z"));
    expect(w.from).toBe("2026-11-02");
    expect(w.start.getTime()).toBeLessThan(new Date("2026-11-01T23:30:00Z").getTime());
  });
  it("goes back by weeks", () => {
    expect(weekBounds("UTC", new Date("2026-10-28T12:00:00Z"), -1).from).toBe("2026-10-19");
    expect(weekBounds("UTC", new Date("2026-10-28T12:00:00Z"), -2).to).toBe("2026-10-18");
  });
});

describe("goals and progress", () => {
  it("keeps only known metrics with sane numbers", () => {
    expect(cleanGoals({ contacted: 10.4, clients: -1, partners: "2", presentations: 99999, other: 5 })).toEqual({ contacted: 10, presentations: 9999 });
    expect(cleanGoals(null)).toEqual({});
  });
  it("measures progress up to a hundred, nothing without a goal", () => {
    expect(progress(3, 10)).toBe(30);
    expect(progress(15, 10)).toBe(100);
    expect(progress(3, 0)).toBeNull();
    expect(progress(3, undefined)).toBeNull();
  });
});

describe("dates and scripts", () => {
  it("adds days to a day", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(stepDate("2026-10-27", 2)).toBe("2026-10-29T00:00:00.000Z");
  });
  it("fills the names into a script", () => {
    expect(fillScript("Hi {name}! I am {my_name}. {full_name}, {name}. {unknown}", { name: "Anna", fullName: "Anna Kowalska", myName: "Andrey" })).toBe("Hi Anna! I am Andrey. Anna Kowalska, Anna. {unknown}");
  });
});
