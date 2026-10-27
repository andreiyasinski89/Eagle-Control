import { describe, expect, it } from "vitest";
import { buildScheduled, defaultSlot, type ScheduleForm } from "@/modules/crm/schedule";
import { placeItem } from "@/modules/views/calendar-items";

const form = (over: Partial<ScheduleForm> = {}): ScheduleForm => ({ kind: "CALL", subject: "Call with Anna", day: "2026-11-03", time: "15:00", durationMin: 30, body: "", ...over });

describe("planning a call or a meeting", () => {
  it("turns what the person typed in their zone into the right instant, with its length", () => {
    const r = buildScheduled(form(), "Europe/Paris");
    expect(r).toEqual({ ok: true, input: { type: "CALL", subject: "Call with Anna", body: null, dueAt: "2026-11-03T14:00:00.000Z", durationMin: 30, completed: false } });
    const ny = buildScheduled(form({ kind: "MEETING", time: "09:30", durationMin: 90, body: " agenda " }), "America/New_York");
    expect(ny.ok && ny.input).toMatchObject({ type: "MEETING", dueAt: "2026-11-03T14:30:00.000Z", durationMin: 90, body: "agenda" });
  });
  it("keeps a planned item open even when its minute has just passed", () => {
    const r = buildScheduled(form({ day: "2020-01-01" }), "UTC");
    expect(r.ok && r.input.completed).toBe(false);
  });
  it("names the first thing that is wrong", () => {
    expect(buildScheduled(form({ subject: "   " }), "UTC")).toEqual({ ok: false, problem: "subject" });
    expect(buildScheduled(form({ day: "2026-13-40" }), "UTC")).toEqual({ ok: false, problem: "day" });
    expect(buildScheduled(form({ time: "25:00" }), "UTC")).toEqual({ ok: false, problem: "time" });
    expect(buildScheduled(form({ time: "" }), "UTC")).toEqual({ ok: false, problem: "time" });
    expect(buildScheduled(form({ durationMin: 0 }), "UTC")).toEqual({ ok: false, problem: "duration" });
    expect(buildScheduled(form({ durationMin: 2000 }), "UTC")).toEqual({ ok: false, problem: "duration" });
  });

  it("suggests the next full hour in the zone of the person, or the next morning when it is late", () => {
    expect(defaultSlot(new Date("2026-11-03T08:10:00Z"), "Europe/Paris")).toEqual({ day: "2026-11-03", time: "10:00" });
    expect(defaultSlot(new Date("2026-11-03T08:10:00Z"), "UTC")).toEqual({ day: "2026-11-03", time: "09:00" });
    expect(defaultSlot(new Date("2026-11-03T20:30:00Z"), "Europe/Paris")).toEqual({ day: "2026-11-04", time: "09:00" });
  });
});

describe("a planned call in the calendar", () => {
  const call = { kind: "crm_activity" as const, at: "2026-11-03T14:00:00.000Z", endAt: "2026-11-03T14:30:00.000Z" };
  it("is a block from its start to its end, in the zone of the person", () => {
    expect(placeItem(call, "Europe/Paris")).toEqual({ day: "2026-11-03", time: "15:00", endTime: "15:30" });
    expect(placeItem(call, "Asia/Tokyo")).toEqual({ day: "2026-11-03", time: "23:00", endTime: "23:30" });
  });
  it("one without a length is a point, as before", () => {
    expect(placeItem({ ...call, endAt: null }, "Europe/Paris")).toEqual({ day: "2026-11-03", time: "15:00" });
  });
});
