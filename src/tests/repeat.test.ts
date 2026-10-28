import { describe, expect, it } from "vitest";
import { exdates, nextOccurrence, occurrences, repeatSchema, toRrule, type Repeat } from "@/modules/nodes/repeat";
import { zonedParts } from "@/modules/views/tz";

const rule = (r: Partial<Repeat> & Pick<Repeat, "freq">): Repeat => repeatSchema.parse({ tz: "Europe/Warsaw", ...r });
// Friday 2026-10-23, 19:00 in Warsaw (summer time, UTC+2); the clocks go back on 2026-10-25.
const FRIDAY = { startsAt: "2026-10-23T17:00:00.000Z", endsAt: "2026-10-23T18:30:00.000Z" };
const D = (s: string) => new Date(`${s}T00:00:00Z`);

describe("repeating events", () => {
  it("a weekly series gives one date a week, always at 19:00 on the wall clock even after the clocks change", () => {
    const list = occurrences({ ...FRIDAY, repeat: rule({ freq: "WEEKLY" }) }, D("2026-10-20"), D("2026-11-20"));
    expect(list.map((o) => o.day)).toEqual(["2026-10-23", "2026-10-30", "2026-11-06", "2026-11-13"]);
    for (const o of list) expect(zonedParts(o.start, "Europe/Warsaw").time).toBe("19:00");
    expect(list[0]?.start.toISOString()).toBe("2026-10-23T17:00:00.000Z"); // before the change: UTC+2
    expect(list[1]?.start.toISOString()).toBe("2026-10-30T18:00:00.000Z"); // after it: UTC+1
  });

  it("keeps the length of the meeting", () => {
    const [o] = occurrences({ ...FRIDAY, repeat: rule({ freq: "WEEKLY" }) }, D("2026-11-01"), D("2026-11-10"));
    expect(o?.end && o.end.getTime() - o.start.getTime()).toBe(90 * 60_000);
  });

  it("every second week, and daily", () => {
    expect(occurrences({ ...FRIDAY, repeat: rule({ freq: "WEEKLY", interval: 2 }) }, D("2026-10-20"), D("2026-12-01")).map((o) => o.day)).toEqual(["2026-10-23", "2026-11-06", "2026-11-20"]);
    expect(occurrences({ ...FRIDAY, repeat: rule({ freq: "DAILY" }) }, D("2026-10-24"), D("2026-10-27")).map((o) => o.day)).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
  });

  it("monthly keeps the day of the month and uses the last day of a shorter month", () => {
    const ev = { startsAt: "2026-01-31T09:00:00.000Z", repeat: rule({ freq: "MONTHLY", tz: "UTC" }) };
    expect(occurrences(ev, D("2026-01-01"), D("2026-05-01")).map((o) => o.day)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("stops after the last day, and leaves out skipped dates", () => {
    const ev = { ...FRIDAY, repeat: rule({ freq: "WEEKLY", until: "2026-11-06", skip: ["2026-10-30"] }) };
    expect(occurrences(ev, D("2026-10-01"), D("2027-01-01")).map((o) => o.day)).toEqual(["2026-10-23", "2026-11-06"]);
  });

  it("never gives a date before the first one, and a plain event is only itself", () => {
    expect(occurrences({ ...FRIDAY, repeat: rule({ freq: "WEEKLY" }) }, D("2026-09-01"), D("2026-10-22"))).toEqual([]);
    expect(occurrences(FRIDAY, D("2026-10-01"), D("2026-11-01")).map((o) => o.day)).toEqual(["2026-10-23"]);
    expect(occurrences(FRIDAY, D("2026-11-01"), D("2026-12-01"))).toEqual([]);
  });

  it("jumps to a window far from the start without walking the whole series", () => {
    const ev = { startsAt: "2020-01-06T10:00:00.000Z", repeat: rule({ freq: "DAILY", tz: "UTC" }) };
    const list = occurrences(ev, D("2026-10-26"), D("2026-10-29"));
    expect(list.map((o) => o.day)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(list[0]?.index).toBe(2485);
  });

  it("is capped, so a series with no end over a long window stays small", () => {
    const ev = { startsAt: "2026-01-01T10:00:00.000Z", repeat: rule({ freq: "DAILY", tz: "UTC" }) };
    expect(occurrences(ev, D("2026-01-01"), D("2030-01-01"), 50)).toHaveLength(50);
  });

  it("tells the next date and how many follow it", () => {
    const ev = { ...FRIDAY, repeat: rule({ freq: "WEEKLY", until: "2026-11-20" }) };
    const { next, more } = nextOccurrence(ev, new Date("2026-10-28T12:00:00Z"));
    expect(next?.day).toBe("2026-10-30");
    expect(more).toBe(3); // 6 Nov, 13 Nov, 20 Nov
    expect(nextOccurrence({ ...FRIDAY, repeat: rule({ freq: "WEEKLY" }) }, new Date("2026-10-28T12:00:00Z")).more).toBeNull();
    expect(nextOccurrence(FRIDAY, new Date()).next).toBeNull();
  });

  it("gives Google the rule", () => {
    expect(toRrule(rule({ freq: "WEEKLY" }))).toBe("FREQ=WEEKLY");
    expect(toRrule(rule({ freq: "WEEKLY", interval: 2, until: "2026-11-20" }))).toBe("FREQ=WEEKLY;INTERVAL=2;UNTIL=20261120T225900Z");
    expect(exdates({ ...FRIDAY, repeat: rule({ freq: "WEEKLY", skip: ["2026-11-06"] }) })).toEqual(["20261106T190000"]);
  });

  it("checks the rule", () => {
    expect(repeatSchema.safeParse({ freq: "YEARLY" }).success).toBe(false);
    expect(repeatSchema.safeParse({ freq: "WEEKLY", interval: 0 }).success).toBe(false);
    expect(repeatSchema.parse({ freq: "WEEKLY" })).toMatchObject({ interval: 1, tz: "UTC", skip: [] });
  });
});
