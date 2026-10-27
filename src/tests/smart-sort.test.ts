import { describe, expect, it } from "vitest";
import { firstWorkday, minutesOf, planSchedule, workdayAt, workdaysBefore, type SortItem } from "@/modules/views/smart-sort";

const task = (id: string, extra: Partial<SortItem> = {}): SortItem => ({ id, title: id, assigneeId: "a", status: "TODO", startDate: null, dueDate: null, estimation: 6, estimationUnit: "STORY_POINTS", position: 0, ...extra });
// 2026-11-02 is a Monday.
const MON = "2026-11-02";
const plan = (items: SortItem[], links: { fromNodeId: string; toNodeId: string }[] = [], extra: Partial<Parameters<typeof planSchedule>[2]> = {}, others: Parameters<typeof planSchedule>[3] = []) => planSchedule(items, links, { startDate: MON, dayMinutes: 60, ...extra }, others);
const where = (moves: ReturnType<typeof plan>) => Object.fromEntries(moves.map((m) => [m.id, `${m.to.start}..${m.to.due}`]));

describe("working days", () => {
  it("skips weekends", () => {
    expect(firstWorkday("2026-11-07")).toBe("2026-11-09"); // Saturday -> Monday
    expect(firstWorkday("2026-11-02")).toBe("2026-11-02");
    expect(workdayAt(MON, 0)).toBe("2026-11-02");
    expect(workdayAt(MON, 4)).toBe("2026-11-06");
    expect(workdayAt(MON, 5)).toBe("2026-11-09");
    expect(workdayAt("2026-11-07", 1)).toBe("2026-11-10");
  });
  it("counts the working days before a day", () => {
    expect(workdaysBefore(MON, "2026-11-02")).toBe(0);
    expect(workdaysBefore(MON, "2026-11-04")).toBe(2);
    expect(workdaysBefore(MON, "2026-11-09")).toBe(5);
    expect(workdaysBefore(MON, "2026-10-30")).toBe(0);
    expect(workdaysBefore(MON, "2026-11-04T00:00:00.000Z")).toBe(2);
  });
});

describe("the length of a task", () => {
  it("a story point is 10 minutes and an hour is 60", () => {
    expect(minutesOf({ estimation: 6, estimationUnit: "STORY_POINTS" }, "HOURS", 480)).toEqual({ minutes: 60, estimated: true });
    expect(minutesOf({ estimation: 1.5, estimationUnit: "HOURS" }, "STORY_POINTS", 480)).toEqual({ minutes: 90, estimated: true });
  });
  it("a task with no unit of its own takes the project unit", () => {
    expect(minutesOf({ estimation: 3, estimationUnit: null }, "STORY_POINTS", 480).minutes).toBe(30);
    expect(minutesOf({ estimation: 3, estimationUnit: null }, "HOURS", 480).minutes).toBe(180);
  });
  it("a task with no estimate takes a whole working day", () => {
    expect(minutesOf({ estimation: null, estimationUnit: null }, "HOURS", 480)).toEqual({ minutes: 480, estimated: false });
    expect(minutesOf({ estimation: 0, estimationUnit: null }, "HOURS", 480).estimated).toBe(false);
  });
});

describe("putting tasks one after another", () => {
  it("one person has tasks following each other; a task that fills the day ends that day and the next starts the next day", () => {
    const m = plan([task("a", { estimation: 6 }), task("b", { estimation: 6, position: 1 }), task("c", { estimation: 3, position: 2 })]);
    expect(where(m)).toEqual({ a: "2026-11-02..2026-11-02", b: "2026-11-03..2026-11-03", c: "2026-11-04..2026-11-04" });
  });
  it("small tasks share a day until it is full", () => {
    const m = plan([task("a", { estimation: 3 }), task("b", { estimation: 3, position: 1 }), task("c", { estimation: 3, position: 2 })]);
    expect(where(m)).toEqual({ a: "2026-11-02..2026-11-02", b: "2026-11-02..2026-11-02", c: "2026-11-03..2026-11-03" });
  });
  it("a long task spans days and skips the weekend", () => {
    const m = plan([task("a", { estimation: 36 }), task("b", { estimation: 6, position: 1 })]); // 6 days of 60 minutes
    expect(where(m)).toEqual({ a: "2026-11-02..2026-11-09", b: "2026-11-10..2026-11-10" });
  });
  it("each person has a queue of their own", () => {
    const m = plan([task("a1", { assigneeId: "a" }), task("a2", { assigneeId: "a", position: 1 }), task("b1", { assigneeId: "b" })]);
    expect(where(m)).toEqual({ a1: "2026-11-02..2026-11-02", a2: "2026-11-03..2026-11-03", b1: "2026-11-02..2026-11-02" });
  });
  it("tasks nobody is assigned to share a queue", () => {
    const m = plan([task("x", { assigneeId: null }), task("y", { assigneeId: null, position: 1 })]);
    expect(where(m)).toEqual({ x: "2026-11-02..2026-11-02", y: "2026-11-03..2026-11-03" });
  });
  it("the earlier deadline goes first, then the order they had", () => {
    const m = plan([task("late", { dueDate: "2026-12-01", position: 0 }), task("soon", { dueDate: "2026-11-05", position: 5 }), task("none", { position: 1 })]);
    expect(m.map((x) => x.id)).toEqual(["soon", "late", "none"]);
  });
  it("finished and cancelled tasks are not moved or counted", () => {
    const m = plan([task("done", { status: "DONE" }), task("cancelled", { status: "CANCELLED" }), task("a")]);
    expect(m.map((x) => x.id)).toEqual(["a"]);
    expect(m[0]?.to.start).toBe(MON);
  });
  it("starts on the given day, a weekend moving to Monday", () => {
    expect(plan([task("a")], [], { startDate: "2026-11-07" })[0]?.to.start).toBe("2026-11-09");
  });
  it("an unestimated task takes a day as long as the day setting", () => {
    const m = plan([task("a", { estimation: null, estimationUnit: null }), task("b", { position: 1 })], [], { dayMinutes: 480 });
    expect(m[0]).toMatchObject({ minutes: 480, estimated: false, to: { start: MON, due: MON } });
    expect(m[1]?.to.start).toBe("2026-11-03");
  });
});

describe("what blocks what", () => {
  it("a blocker is placed first even with a later deadline, and the other person waits for it", () => {
    const m = plan(
      [task("first", { assigneeId: "a", dueDate: "2026-12-31", estimation: 12 }), task("second", { assigneeId: "b", dueDate: "2026-11-03", estimation: 6 })],
      [{ fromNodeId: "first", toNodeId: "second" }],
    );
    expect(m.map((x) => x.id)).toEqual(["first", "second"]);
    expect(where(m)).toEqual({ first: "2026-11-02..2026-11-03", second: "2026-11-04..2026-11-04" });
  });
  it("a task blocked by one that ends part-way through a day starts the day after, so the timeline shows no clash", () => {
    const m = plan([task("a", { estimation: 3 }), task("b", { estimation: 3, assigneeId: "b" })], [{ fromNodeId: "a", toNodeId: "b" }]);
    expect(where(m)).toEqual({ a: "2026-11-02..2026-11-02", b: "2026-11-03..2026-11-03" });
  });
  it("a blocker that is not being moved and is not finished holds the task until the day after its due date", () => {
    const m = plan([task("t")], [{ fromNodeId: "ext", toNodeId: "t" }], {}, [{ id: "ext", status: "IN_PROGRESS", dueDate: "2026-11-04" }]);
    expect(m[0]?.to.start).toBe("2026-11-05");
    const done = plan([task("t")], [{ fromNodeId: "ext", toNodeId: "t" }], {}, [{ id: "ext", status: "DONE", dueDate: "2026-11-04" }]);
    expect(done[0]?.to.start).toBe(MON);
  });
  it("a loop of blockers does not stall the plan", () => {
    const m = plan([task("a"), task("b", { position: 1 })], [{ fromNodeId: "a", toNodeId: "b" }, { fromNodeId: "b", toNodeId: "a" }]);
    expect(m.map((x) => x.id).sort()).toEqual(["a", "b"]);
  });
});

describe("what the plan says about each task", () => {
  it("keeps the old dates, marks tasks without an estimate and tasks that now end after their deadline", () => {
    const m = plan([task("a", { estimation: 6, startDate: "2026-10-01", dueDate: "2026-10-30" }), task("b", { estimation: null, estimationUnit: null, dueDate: "2026-11-02", position: 1 })]);
    expect(m[0]).toMatchObject({ from: { start: "2026-10-01", due: "2026-10-30" }, late: true });
    expect(m[1]).toMatchObject({ estimated: false });
  });
});
