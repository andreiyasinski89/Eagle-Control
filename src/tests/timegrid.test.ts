import { describe, expect, it } from "vitest";
import { DEFAULT_MINUTES, HOUR_PX, MIN_MINUTES, initialFocus, layoutDay, minutesToPx, parseClock, splitTimed } from "@/modules/views/timegrid";

describe("parseClock", () => {
  it("reads times of day, with 24:00 as the end of the day", () => {
    expect(parseClock("09:30")).toBe(570);
    expect(parseClock("9:05")).toBe(545);
    expect(parseClock("00:00")).toBe(0);
    expect(parseClock("24:00")).toBe(1440);
  });
  it("refuses anything else", () => {
    for (const bad of [undefined, null, "", "25:00", "24:01", "12:60", "noon", "12", "12:5"]) expect(parseClock(bad)).toBeNull();
  });
});

describe("layoutDay", () => {
  it("gives a lone event the full width and one hour by default", () => {
    expect(layoutDay([{ id: "a", start: 600 }])).toEqual([{ id: "a", start: 600, end: 600 + DEFAULT_MINUTES, col: 0, cols: 1 }]);
  });

  it("puts events that overlap side by side", () => {
    const p = layoutDay([
      { id: "a", start: 600, end: 720 },
      { id: "b", start: 630, end: 690 },
    ]);
    expect(p.map((x) => [x.id, x.col, x.cols])).toEqual([["a", 0, 2], ["b", 1, 2]]);
  });

  it("does not narrow events that merely follow each other", () => {
    const p = layoutDay([
      { id: "a", start: 600, end: 660 },
      { id: "b", start: 660, end: 720 },
    ]);
    expect(p.every((x) => x.col === 0 && x.cols === 1)).toBe(true);
  });

  it("reuses a freed column inside a group and sizes the group by its busiest moment", () => {
    // a: 10-12, b: 10:30-11, c: 11-11:45 (fits under a, after b) → two columns
    const p = layoutDay([
      { id: "a", start: 600, end: 720 },
      { id: "b", start: 630, end: 660 },
      { id: "c", start: 660, end: 705 },
    ]);
    expect(Object.fromEntries(p.map((x) => [x.id, [x.col, x.cols]]))).toEqual({ a: [0, 2], b: [1, 2], c: [1, 2] });
  });

  it("keeps separate groups independent", () => {
    const p = layoutDay([
      { id: "a", start: 540, end: 600 },
      { id: "b", start: 560, end: 620 },
      { id: "c", start: 900, end: 960 },
    ]);
    expect(p.find((x) => x.id === "c")).toMatchObject({ col: 0, cols: 1 });
    expect(p.find((x) => x.id === "a")?.cols).toBe(2);
  });

  it("never draws an event shorter than the minimum, past midnight, or before it", () => {
    const [short] = layoutDay([{ id: "s", start: 600, end: 605 }]);
    expect(short!.end - short!.start).toBe(MIN_MINUTES);
    const [late] = layoutDay([{ id: "l", start: 1430, end: 1500 }]);
    expect(late!.end).toBe(1440);
    expect(late!.end - late!.start).toBeGreaterThanOrEqual(MIN_MINUTES);
    expect(layoutDay([{ id: "e", start: -50, end: 30 }])[0]!.start).toBe(0);
  });

  it("is stable for events that start together: the longer one comes first", () => {
    const p = layoutDay([
      { id: "short", start: 600, end: 630 },
      { id: "long", start: 600, end: 720 },
    ]);
    expect(p.find((x) => x.id === "long")!.col).toBe(0);
  });
});

describe("splitTimed", () => {
  it("sends items without a time of day to the all-day strip", () => {
    const { allDay, timed } = splitTimed([{ id: "a", time: "10:00" }, { id: "b" }, { id: "c", time: "nope" }]);
    expect(timed.map((i) => i.id)).toEqual(["a"]);
    expect(allDay.map((i) => i.id)).toEqual(["b", "c"]);
  });
});

describe("initialFocus and sizes", () => {
  it("opens an hour before the first event, else near now, else at 07:00", () => {
    expect(initialFocus([600, 900], 700)).toBe(540);
    expect(initialFocus([], 800)).toBe(740);
    expect(initialFocus([], null)).toBe(420);
    expect(initialFocus([30], null)).toBe(0);
  });
  it("is 48px per hour", () => expect(minutesToPx(90)).toBe(1.5 * HOUR_PX));
});
