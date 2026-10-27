import { describe, expect, it } from "vitest";
import { browserTimeZone, isValidTimeZone, listTimeZones, offsetLabel, offsetMinutes, todayIn, zonedParts, zonedToUtc } from "@/modules/views/tz";
import { placeItem } from "@/modules/views/calendar-items";
import { buildEvent, defaultTimes, type EventForm } from "@/modules/views/new-event";

const form = (over: Partial<EventForm> = {}): EventForm => ({ title: "Call", day: "2026-11-03", allDay: false, start: "10:00", end: "11:00", location: "", meetingUrl: "", agenda: "", addMeet: false, attendeeId: "u1", ...over });

describe("time zones", () => {
  it("knows real zones and refuses made-up ones", () => {
    for (const ok of ["UTC", "Europe/Paris", "Asia/Kolkata", "America/New_York"]) expect(isValidTimeZone(ok), ok).toBe(true);
    for (const no of ["", "Mars/Olympus", "Europe/Pariss", "x".repeat(70)]) expect(isValidTimeZone(no), no).toBe(false);
    expect(listTimeZones()[0]).toBe("UTC");
    expect(listTimeZones()).toContain("Europe/Warsaw");
    expect(isValidTimeZone(browserTimeZone())).toBe(true);
  });

  it("measures the offset, including half hours and daylight saving", () => {
    expect(offsetMinutes(new Date("2026-12-01T12:00:00Z"), "Europe/Paris")).toBe(60);
    expect(offsetMinutes(new Date("2026-07-01T12:00:00Z"), "Europe/Paris")).toBe(120);
    expect(offsetMinutes(new Date("2026-07-01T12:00:00Z"), "Asia/Kolkata")).toBe(330);
    expect(offsetMinutes(new Date("2026-01-15T12:00:00Z"), "America/New_York")).toBe(-300);
    expect(offsetLabel("Europe/Paris", new Date("2026-12-01T12:00:00Z"))).toBe("UTC+01:00");
    expect(offsetLabel("Asia/Kolkata", new Date("2026-07-01T12:00:00Z"))).toBe("UTC+05:30");
    expect(offsetLabel("America/New_York", new Date("2026-01-15T12:00:00Z"))).toBe("UTC−05:00");
    expect(offsetLabel("UTC")).toBe("UTC");
  });

  it("puts an instant on the day and hour of a zone, across midnight too", () => {
    expect(zonedParts("2026-10-27T17:00:00.000Z", "Europe/Paris")).toEqual({ day: "2026-10-27", time: "18:00", minutes: 1080 });
    expect(zonedParts("2026-10-27T23:30:00.000Z", "Europe/Paris")).toMatchObject({ day: "2026-10-28", time: "00:30" });
    expect(zonedParts("2026-10-27T03:00:00.000Z", "America/New_York")).toMatchObject({ day: "2026-10-26", time: "23:00" });
    expect(todayIn("Pacific/Auckland", new Date("2026-10-27T12:00:00Z"))).toBe("2026-10-28");
  });

  it("turns a wall-clock time in a zone back into the same instant", () => {
    expect(zonedToUtc("2026-11-03", "10:00", "Europe/Paris").toISOString()).toBe("2026-11-03T09:00:00.000Z"); // winter
    expect(zonedToUtc("2026-07-01", "10:00", "Europe/Paris").toISOString()).toBe("2026-07-01T08:00:00.000Z"); // summer
    expect(zonedToUtc("2026-11-03", "00:30", "Europe/Paris").toISOString()).toBe("2026-11-02T23:30:00.000Z");
    expect(zonedToUtc("2026-11-03", "10:00", "Asia/Kolkata").toISOString()).toBe("2026-11-03T04:30:00.000Z");
    for (const tz of ["Europe/Warsaw", "America/Los_Angeles", "Asia/Tbilisi", "UTC"]) {
      const back = zonedParts(zonedToUtc("2026-11-03", "18:15", tz), tz);
      expect([back.day, back.time], tz).toEqual(["2026-11-03", "18:15"]);
    }
  });

  it("lands a time that does not exist (clocks jumped forward) after the jump instead of failing", () => {
    const d = zonedToUtc("2026-03-29", "02:30", "Europe/Paris");
    expect(Number.isNaN(d.getTime())).toBe(false);
    expect(zonedParts(d, "Europe/Paris").day).toBe("2026-03-29");
  });
});

describe("calendar items in a zone", () => {
  const evt = (at: string, endAt: string | null = null) => ({ kind: "event" as const, at, endAt });

  it("moves a timed event to the person's hours and keeps its length", () => {
    expect(placeItem(evt("2026-11-03T09:00:00.000Z", "2026-11-03T10:00:00.000Z"), "Europe/Paris")).toEqual({ day: "2026-11-03", time: "10:00", endTime: "11:00" });
    expect(placeItem(evt("2026-11-03T09:00:00.000Z", "2026-11-03T10:00:00.000Z"), "UTC")).toEqual({ day: "2026-11-03", time: "09:00", endTime: "10:00" });
  });
  it("puts an evening event on the next day for someone far east, and cuts one that runs past midnight", () => {
    expect(placeItem(evt("2026-11-03T20:00:00.000Z", "2026-11-03T21:00:00.000Z"), "Asia/Tokyo")).toMatchObject({ day: "2026-11-04", time: "05:00" });
    expect(placeItem(evt("2026-11-03T22:00:00.000Z", "2026-11-03T23:30:00.000Z"), "Europe/Paris")).toEqual({ day: "2026-11-03", time: "23:00", endTime: "24:00" });
  });
  it("keeps all-day items on their own date whatever the zone", () => {
    expect(placeItem(evt("2026-11-03T00:00:00.000Z"), "America/Los_Angeles")).toEqual({ day: "2026-11-03" });
    expect(placeItem({ kind: "task", at: "2026-11-03T00:00:00.000Z", endAt: null }, "Pacific/Auckland")).toEqual({ day: "2026-11-03" });
    expect(placeItem({ kind: "deal_close", at: "2026-11-03T00:00:00.000Z", endAt: null }, "Asia/Tokyo")).toEqual({ day: "2026-11-03" });
  });
  it("a CRM activity with a time moves, one without stays", () => {
    expect(placeItem({ kind: "crm_activity", at: "2026-11-03T13:00:00.000Z", endAt: null }, "Europe/Paris")).toEqual({ day: "2026-11-03", time: "14:00" });
    expect(placeItem({ kind: "crm_activity", at: "2026-11-03T00:00:00.000Z", endAt: null }, "Europe/Paris")).toEqual({ day: "2026-11-03" });
  });
});

describe("new meeting in a zone", () => {
  it("stores what the person typed as the right instant", () => {
    const r = buildEvent(form(), "Europe/Paris");
    expect(r.ok && r.data).toMatchObject({ startsAt: "2026-11-03T09:00:00.000Z", endsAt: "2026-11-03T10:00:00.000Z" });
    const ny = buildEvent(form({ start: "18:00", end: "19:30" }), "America/New_York");
    expect(ny.ok && ny.data).toMatchObject({ startsAt: "2026-11-03T23:00:00.000Z", endsAt: "2026-11-04T00:30:00.000Z" });
  });
  it("an all-day meeting is a date and ignores the zone", () => {
    const r = buildEvent(form({ allDay: true }), "Pacific/Auckland");
    expect(r.ok && r.data.startsAt).toBe("2026-11-03T00:00:00.000Z");
  });
  it("defaults to the next full hour of the person's day", () => {
    expect(defaultTimes(undefined, new Date("2026-11-03T08:10:00Z"), "Europe/Paris")).toEqual({ start: "10:00", end: "11:00" });
    expect(defaultTimes(undefined, new Date("2026-11-03T08:10:00Z"))).toEqual({ start: "09:00", end: "10:00" });
    expect(defaultTimes("14:30", new Date(), "Asia/Tokyo")).toEqual({ start: "14:30", end: "15:30" });
  });
  it("a meeting made in one zone shows at the right hour in another", () => {
    const made = buildEvent(form({ start: "10:00", end: "11:00" }), "Europe/Paris");
    if (!made.ok) throw new Error("form should be valid");
    expect(placeItem({ kind: "event", at: made.data.startsAt, endAt: made.data.endsAt ?? null }, "America/New_York")).toEqual({ day: "2026-11-03", time: "04:00", endTime: "05:00" });
  });
});
