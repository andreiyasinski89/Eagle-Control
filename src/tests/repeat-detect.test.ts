import { describe, expect, it } from "vitest";
import { occurrences } from "@/modules/nodes/repeat";
import { detectSeries, type EventRow } from "@/modules/nodes/repeat-detect";

const TZ = "Europe/Warsaw";
let n = 0;
const ev = (title: string, startsAt: string, endsAt?: string, extra: Partial<EventRow> = {}): EventRow => ({ id: `e${++n}`, title, startsAt, endsAt, ...extra });
// Fridays 19:00 Warsaw: UTC+2 until 25 Oct, UTC+1 after.
const fridays = (title: string, dates: string[]) => dates.map((d) => ev(title, `${d}T${d < "2026-10-25" ? "17" : "18"}:00:00.000Z`, `${d}T${d < "2026-10-25" ? "18" : "19"}:30:00.000Z`));

describe("finding events that are one series", () => {
  it("joins a run of weekly events into one series that keeps the earliest and drops the rest", () => {
    const rows = fridays("MWR Life презентация", ["2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30", "2026-11-06", "2026-11-13"]);
    const [s, ...more] = detectSeries(rows, TZ);
    expect(more).toEqual([]);
    expect(s).toMatchObject({ keepId: rows[0]?.id, count: 6, first: "2026-10-09", last: "2026-11-13", time: "19:00", rule: { freq: "WEEKLY", interval: 1, until: "2026-11-13", tz: TZ, skip: [] } });
    expect(s?.dropIds).toEqual(rows.slice(1).map((r) => r.id));
  });

  it("the series gives back exactly the dates that were entered", () => {
    const rows = fridays("Катана тревел", ["2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30", "2026-11-06"]);
    const s = detectSeries(rows, TZ)[0];
    const got = occurrences({ startsAt: rows[0]?.startsAt, endsAt: rows[0]?.endsAt, repeat: s?.rule }, new Date("2026-01-01"), new Date("2027-01-01"));
    expect(got.map((o) => o.start.toISOString())).toEqual(rows.map((r) => new Date(r.startsAt).toISOString()));
  });

  it("a week that is missing becomes a skipped date, but too many holes are not a series", () => {
    const holey = fridays("Звонок", ["2026-10-02", "2026-10-09", "2026-10-23", "2026-10-30", "2026-11-06"]);
    expect(detectSeries(holey, TZ)[0]?.rule).toMatchObject({ freq: "WEEKLY", skip: ["2026-10-16"] });
    const sparse = fridays("Звонок", ["2026-09-04", "2026-10-02", "2026-11-06"]);
    expect(detectSeries(sparse, TZ)).toEqual([]);
  });

  it("every second week", () => {
    const s = detectSeries(fridays("Планёрка", ["2026-10-02", "2026-10-16", "2026-10-30", "2026-11-13"]), TZ)[0];
    expect(s?.rule).toMatchObject({ freq: "WEEKLY", interval: 2, skip: [] });
  });

  it("needs three dates, the same title, hour and length", () => {
    expect(detectSeries(fridays("Звонок", ["2026-10-09", "2026-10-16"]), TZ)).toEqual([]);
    const mixed = [...fridays("Звонок", ["2026-10-09", "2026-10-16"]), ...fridays("Другая встреча", ["2026-10-23"])];
    expect(detectSeries(mixed, TZ)).toEqual([]);
    const otherHour = fridays("Звонок", ["2026-10-09", "2026-10-16", "2026-10-23"]);
    otherHour[2] = ev("Звонок", "2026-10-23T09:00:00.000Z", "2026-10-23T10:00:00.000Z");
    expect(detectSeries(otherHour, TZ)).toEqual([]);
  });

  it("ignores the case and spacing of the title, and a duplicate on the same day goes with the series", () => {
    const rows = fridays("  Звонок  ", ["2026-10-09", "2026-10-16", "2026-10-23"]);
    rows.push(ev("звонок", rows[1]?.startsAt as string, rows[1]?.endsAt));
    const [s] = detectSeries(rows, TZ);
    expect(s?.count).toBe(3);
    expect(s?.dropIds).toHaveLength(3);
  });

  it("two weekdays with the same title are two series", () => {
    const fri = fridays("Звонок", ["2026-10-09", "2026-10-16", "2026-10-23"]);
    const sat = ["2026-10-10", "2026-10-17", "2026-10-24"].map((d) => ev("Звонок", `${d}T17:00:00.000Z`, `${d}T18:30:00.000Z`));
    expect(detectSeries([...fri, ...sat], TZ)).toHaveLength(2);
  });

  it("every day and every month, with an exact rhythm", () => {
    const daily = ["2026-10-01", "2026-10-02", "2026-10-03"].map((d) => ev("Зарядка", `${d}T06:00:00.000Z`));
    expect(detectSeries(daily, "UTC")[0]?.rule).toMatchObject({ freq: "DAILY" });
    const monthly = ["2026-01-15", "2026-02-15", "2026-03-15"].map((d) => ev("Отчёт", `${d}T09:00:00.000Z`));
    expect(detectSeries(monthly, "UTC")[0]?.rule).toMatchObject({ freq: "MONTHLY" });
  });

  it("leaves a series that already repeats alone, and unites the people invited", () => {
    const rows = fridays("Звонок", ["2026-10-09", "2026-10-16", "2026-10-23"]);
    expect(detectSeries(rows.map((r) => ({ ...r, repeating: true })), TZ)).toEqual([]);
    rows[0] = { ...(rows[0] as EventRow), attendeeIds: ["a"] };
    rows[2] = { ...(rows[2] as EventRow), attendeeIds: ["b", "a"] };
    expect(detectSeries(rows, TZ)[0]?.attendeeIds.sort()).toEqual(["a", "b"]);
  });
});
