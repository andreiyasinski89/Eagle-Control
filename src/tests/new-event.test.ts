import { describe, expect, it } from "vitest";
import { buildEvent, defaultTimes, type EventForm } from "@/modules/views/new-event";
import { looksLikeXlsx, sheetRowsToCsv } from "@/modules/crm/xlsx";
import { mapContactRow, parseCsv, suggestMapping, CONTACT_FIELDS } from "@/modules/crm/csv";
import { contactKeys } from "@/modules/crm/dedupe";

const form = (over: Partial<EventForm> = {}): EventForm => ({ title: "Demo call", day: "2026-11-03", allDay: false, start: "10:00", end: "11:00", location: "", meetingUrl: "", agenda: "", addMeet: false, attendeeId: "u1", ...over });

describe("new meeting form", () => {
  it("starts at the clicked time and lasts an hour", () => {
    expect(defaultTimes("14:30", new Date("2026-11-03T08:10:00Z"))).toEqual({ start: "14:30", end: "15:30" });
  });
  it("without a click it starts at the next full hour", () => {
    expect(defaultTimes(undefined, new Date("2026-11-03T08:10:00Z"))).toEqual({ start: "09:00", end: "10:00" });
  });
  it("never runs past midnight", () => {
    expect(defaultTimes("23:30", new Date()).end).toBe("23:59");
    expect(defaultTimes(undefined, new Date("2026-11-03T23:10:00Z")).start).toBe("22:00");
  });

  it("builds the event data with the creator as attendee", () => {
    const r = buildEvent(form({ location: "Office", agenda: " Agenda ", addMeet: true }));
    expect(r).toEqual({ ok: true, title: "Demo call", data: { startsAt: "2026-11-03T10:00:00.000Z", endsAt: "2026-11-03T11:00:00.000Z", attendeeIds: ["u1"], agenda: "Agenda", addMeet: true, location: "Office" } });
  });
  it("an all-day meeting has no end and no clock times", () => {
    const r = buildEvent(form({ allDay: true, start: "", end: "" }));
    expect(r.ok && r.data).toMatchObject({ startsAt: "2026-11-03T00:00:00.000Z" });
    expect(r.ok && r.data.endsAt).toBeUndefined();
  });
  it("a given link wins over asking Google for a Meet link", () => {
    const r = buildEvent(form({ meetingUrl: "https://zoom.us/j/1", addMeet: true }));
    expect(r.ok && r.data.meetingUrl).toBe("https://zoom.us/j/1");
    expect(r.ok && r.data.addMeet).toBeUndefined();
  });
  it("names the first problem", () => {
    expect(buildEvent(form({ title: "  " }))).toEqual({ ok: false, problem: "title" });
    expect(buildEvent(form({ end: "10:00" }))).toEqual({ ok: false, problem: "time" });
    expect(buildEvent(form({ start: "25:00" }))).toEqual({ ok: false, problem: "time" });
    expect(buildEvent(form({ meetingUrl: "zoom" }))).toEqual({ ok: false, problem: "url" });
    expect(buildEvent(form({ day: "2026-13-40" }))).toEqual({ ok: false, problem: "day" });
  });
});

describe("Excel import", () => {
  const sheet = [[], [null, null], ["П или Б", "ФИО", "Страна", null, "Этап", "Этап"], ["Б", "Стас Телепорто", "Португалия", null, "Звонок", new Date("2026-03-05T00:00:00Z")], [null, null, null], ["П", "Надя Годун", "Франция", null, 7, true]];

  it("recognises a workbook by its zip signature", () => {
    expect(looksLikeXlsx(new Uint8Array([0x50, 0x4b, 3, 4, 0]))).toBe(true);
    expect(looksLikeXlsx(new TextEncoder().encode("a,b\n1,2"))).toBe(false);
  });
  it("takes the first non-empty row as the header and drops blank rows and columns", () => {
    const p = parseCsv(sheetRowsToCsv(sheet));
    expect(p.headers).toEqual(["П или Б", "ФИО", "Страна", "Этап", "Этап (2)"]);
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0]).toMatchObject({ ФИО: "Стас Телепорто", "Этап (2)": "2026-03-05" });
    expect(p.rows[1]).toMatchObject({ "Этап": "7", "Этап (2)": "yes" });
  });
  it("skips a one-cell title above the table", () => {
    const p = parseCsv(sheetRowsToCsv([["Client list"], [], ["Name", "Country"], ["Anna", "PT"]]));
    expect(p.headers).toEqual(["Name", "Country"]);
    expect(p.rows).toEqual([{ Name: "Anna", Country: "PT" }]);
  });
  it("a single-column sheet keeps its first row as the header", () => {
    expect(parseCsv(sheetRowsToCsv([["Name"], ["Anna"], ["Boris"]])).rows).toHaveLength(2);
  });
  it("an empty sheet gives no text", () => expect(sheetRowsToCsv([[], [null]])).toBe(""));

  it("maps a ФИО column to first and last name and keeps other columns in the note", () => {
    const p = parseCsv(sheetRowsToCsv(sheet));
    const mapping = suggestMapping(p.headers, CONTACT_FIELDS);
    expect(mapping.fullName).toBe("ФИО");
    const r = mapContactRow(p.rows[0] as Record<string, string>, mapping, ["Страна", "Этап"]);
    expect(r.ok && r.record).toMatchObject({ firstName: "Стас", lastName: "Телепорто", notes: "Страна: Португалия\nЭтап: Звонок" });
  });
  it("leaves the note empty when the chosen columns are blank", () => {
    const r = mapContactRow({ ФИО: "Иван Петров", Страна: "" }, { fullName: "ФИО" }, ["Страна"]);
    expect(r.ok && r.record.notes).toBeNull();
  });

  it("matches a contact with no e-mail or phone by name, so a second import does not double the list", () => {
    expect(contactKeys({ emails: [], phones: [], firstName: "Стас", lastName: "Телепорто" })).toEqual(["n:стас телепорто"]);
    expect(contactKeys({ emails: ["A@x.io"], phones: [], firstName: "Стас", lastName: "Телепорто" })).toEqual(["e:a@x.io"]);
  });
});
