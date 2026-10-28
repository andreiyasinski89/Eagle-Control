import { describe, expect, it } from "vitest";
import { addDays, addMonths, BOARD_COLUMNS, buildArrows, buildTimeline, byDay, groupByStatus, monthGrid, parseView, shiftDates, sortItems, weekGrid, workItems, type WorkItem } from "@/modules/views/views";

const item = (id: string, over: Partial<WorkItem> = {}): WorkItem => ({
  id,
  parentId: "p",
  type: "TASK",
  title: id,
  status: "TODO",
  progress: 0,
  health: "GREEN",
  assigneeId: null,
  startDate: null,
  dueDate: null,
  estimation: null,
  blocked: false,
  ...over,
});

describe("view selection", () => {
  it("falls back to the map for anything unknown", () => {
    expect(parseView("kanban")).toBe("kanban");
    expect(parseView("gantt")).toBe("map");
    expect(parseView(null)).toBe("map");
  });
});

describe("work items and board", () => {
  it("keeps tasks and subtasks only", () => {
    const nodes = [item("a"), item("b", { type: "EPIC" }), item("c", { type: "SUBTASK" }), item("d", { type: "DOCUMENT" })];
    expect(workItems(nodes).map((n) => n.id)).toEqual(["a", "c"]);
  });
  it("groups by status in board order and leaves cancelled work off the board", () => {
    const g = groupByStatus([item("a", { status: "DONE" }), item("b", { status: "BACKLOG" }), item("c", { status: "CANCELLED" }), item("d", { status: "DONE" })]);
    expect(Object.keys(g)).toEqual([...BOARD_COLUMNS]);
    expect(g.DONE.map((i) => i.id)).toEqual(["a", "d"]);
    expect(Object.values(g).flat().map((i) => i.id)).not.toContain("c");
  });
});

describe("sorting", () => {
  const name = (id: string | null) => ({ u1: "Zoe", u2: "adam" })[id ?? ""] ?? "";
  const items = [item("b", { dueDate: "2026-11-02T00:00:00.000Z", assigneeId: "u1", estimation: 5 }), item("a", { dueDate: null }), item("c", { dueDate: "2026-11-01T00:00:00.000Z", assigneeId: "u2", estimation: 2 })];
  it("puts empty values last in both directions", () => {
    expect(sortItems(items, "due", "asc", name).map((i) => i.id)).toEqual(["c", "b", "a"]);
    expect(sortItems(items, "due", "desc", name).map((i) => i.id)).toEqual(["b", "c", "a"]);
  });
  it("sorts text case-insensitively and numbers numerically, keeping ties in their order", () => {
    expect(sortItems(items, "assignee", "asc", name).map((i) => i.id)).toEqual(["c", "b", "a"]);
    expect(sortItems(items, "estimation", "desc", name).map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(sortItems([item("x", { status: "DONE" }), item("y", { status: "BACKLOG" })], "status", "asc", name).map((i) => i.id)).toEqual(["y", "x"]);
    expect(sortItems([item("b"), item("a")], "progress", "asc", name).map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("calendar grids", () => {
  it("always has six Monday-first weeks", () => {
    const g = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(g).toHaveLength(42);
    expect(g[0]).toBe("2026-09-28");
    expect(g[3]).toBe("2026-10-01");
    expect(g[41]).toBe("2026-11-08");
    expect(monthGrid(2026, 1)[0]).toBe("2026-01-26"); // Feb 2026 starts on a Sunday → six leading days
  });
  it("finds the week and moves by days and months", () => {
    expect(weekGrid("2026-10-28")).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", -1)).toBe("2025-12-01");
  });
  it("buckets by due day and skips undated items", () => {
    const m = byDay([item("a", { dueDate: "2026-10-28T00:00:00.000Z" }), item("b", { dueDate: "2026-10-28T15:00:00.000Z" }), item("c")]);
    expect([...m.keys()]).toEqual(["2026-10-28"]);
    expect(m.get("2026-10-28")).toHaveLength(2);
  });
});

describe("timeline", () => {
  const px = 10;
  it("lays bars out on a day axis with a week of margin", () => {
    const t = buildTimeline([item("a", { startDate: "2026-10-26T00:00:00.000Z", dueDate: "2026-10-30T00:00:00.000Z" }), item("b", { dueDate: "2026-11-02T00:00:00.000Z" }), item("c")], "2026-10-28", px);
    expect(t.rangeStart).toBe("2026-10-19");
    expect(t.unscheduled).toEqual(["c"]);
    const [a, b] = t.bars;
    expect(a).toMatchObject({ x: 70, w: 50, row: 0 }); // 7 days of margin, 5 days long
    expect(b).toMatchObject({ x: 140, w: 10, row: 1 }); // a single due date is a one-day bar
    expect(t.todayX).toBe(9 * px + px / 2);
    expect(t.days).toBe(22); // 19 Oct … 9 Nov inclusive
  });
  it("can start on today and leave the past out: a task from before is cut at the left edge, an overdue one is a one-day bar at the start", () => {
    const t = buildTimeline(
      [
        item("began", { startDate: "2026-10-24T00:00:00.000Z", dueDate: "2026-10-30T00:00:00.000Z" }),
        item("late", { startDate: "2026-10-20T00:00:00.000Z", dueDate: "2026-10-22T00:00:00.000Z" }),
        item("next", { dueDate: "2026-11-02T00:00:00.000Z" }),
      ],
      "2026-10-28",
      px,
      { from: "2026-10-28" },
    );
    expect(t.rangeStart).toBe("2026-10-28");
    expect(t.todayX).toBe(px / 2); // today is the first day
    const [began, late, next] = t.bars;
    expect(began).toMatchObject({ start: "2026-10-28", end: "2026-10-30", x: 0, w: 30, cut: true });
    expect(late).toMatchObject({ start: "2026-10-28", end: "2026-10-28", x: 0, w: 10, late: true });
    expect(next).toMatchObject({ x: 50, w: 10 });
    expect(next?.cut).toBeUndefined();
    expect(t.days).toBe(13); // 28 Oct … 9 Nov (a week of air after the last task)
  });
  it("reads a start after the due date as a one-day bar and copes with nothing scheduled", () => {
    const t = buildTimeline([item("a", { startDate: "2026-11-05T00:00:00.000Z", dueDate: "2026-11-01T00:00:00.000Z" })], "2026-10-28", px);
    expect(t.bars[0]).toMatchObject({ start: "2026-11-01", end: "2026-11-01", w: 10 });
    expect(buildTimeline([item("x")], "2026-10-28", px).bars).toEqual([]);
  });
  it("draws blocker→blocked arrows and flags plans that cannot work", () => {
    const t = buildTimeline([item("a", { startDate: "2026-10-26T00:00:00.000Z", dueDate: "2026-10-28T00:00:00.000Z" }), item("b", { startDate: "2026-10-29T00:00:00.000Z", dueDate: "2026-10-30T00:00:00.000Z" }), item("c", { startDate: "2026-10-27T00:00:00.000Z", dueDate: "2026-10-27T00:00:00.000Z" })], "2026-10-28", px);
    const arrows = buildArrows(t.bars, [{ fromNodeId: "a", toNodeId: "b" }, { fromNodeId: "a", toNodeId: "c" }, { fromNodeId: "a", toNodeId: "ghost" }]);
    expect(arrows).toHaveLength(2);
    expect(arrows[0]).toMatchObject({ from: "a", to: "b", conflict: false });
    expect(arrows[0]!.x1).toBe(t.bars[0]!.x + t.bars[0]!.w);
    expect(arrows[0]!.x2).toBe(t.bars[1]!.x);
    expect(arrows[1]).toMatchObject({ to: "c", conflict: true }); // a ends the 28th, c starts the 27th
  });
  it("shifts both dates together", () => {
    expect(shiftDates("2026-10-26T00:00:00.000Z", "2026-10-28T00:00:00.000Z", 3)).toEqual({ startDate: "2026-10-29T00:00:00.000Z", dueDate: "2026-10-31T00:00:00.000Z" });
    expect(shiftDates(null, "2026-10-31T00:00:00.000Z", 1)).toEqual({ startDate: null, dueDate: "2026-11-01T00:00:00.000Z" });
  });
});
