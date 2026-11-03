import { describe, expect, it } from "vitest";
import { DEFAULT_AGENT_SETTINGS } from "@/modules/crm/agent-settings";
import { dueRoles, type DueInput } from "@/modules/crm/agent-schedule";

// Warsaw is UTC+1 in November: 07:00Z is 08:00 on the wall clock.
const at = (hhmmZ: string, day = "2026-11-03") => new Date(`${day}T${hhmmZ}:00.000Z`);
const input = (over: Partial<DueInput> & { now: Date }): DueInput => ({ settings: { ...DEFAULT_AGENT_SETTINGS, enabled: true }, tz: "Europe/Warsaw", lastOk: {}, failuresToday: {}, ...over });

describe("What is due", () => {
  it("is nothing when the agent is off", () => {
    expect(dueRoles(input({ now: at("07:00"), settings: DEFAULT_AGENT_SETTINGS }))).toEqual([]);
  });

  it("gives the morning briefing from the person's time, for three hours, once a day", () => {
    expect(dueRoles(input({ now: at("06:59") }))).toEqual([]); // 07:59 in Warsaw
    expect(dueRoles(input({ now: at("07:00") }))).toEqual(["morning_briefing"]);
    expect(dueRoles(input({ now: at("08:59") }))).toContain("morning_briefing");
    expect(dueRoles(input({ now: at("10:00") }))).not.toContain("morning_briefing"); // 11:00 in Warsaw: too late for a briefing
    expect(dueRoles(input({ now: at("07:05"), lastOk: { morning_briefing: at("07:01") } }))).toEqual([]);
    expect(dueRoles(input({ now: at("07:05"), lastOk: { morning_briefing: at("07:01", "2026-11-02") } }))).toEqual(["morning_briefing"]);
  });

  it("follows the briefing time the person chose", () => {
    const settings = { ...DEFAULT_AGENT_SETTINGS, enabled: true, briefingTime: "06:30" };
    expect(dueRoles(input({ now: at("05:29"), settings }))).toEqual([]);
    expect(dueRoles(input({ now: at("05:30"), settings }))).toEqual(["morning_briefing"]);
  });

  it("wakes the follow-up keeper every two hours from 09:00 to 21:00", () => {
    expect(dueRoles(input({ now: at("07:30"), lastOk: { morning_briefing: at("07:01") } }))).toEqual([]); // 08:30: before the first slot
    expect(dueRoles(input({ now: at("08:00"), lastOk: { morning_briefing: at("07:01") } }))).toEqual(["stale_followups"]); // 09:00
    expect(dueRoles(input({ now: at("08:15"), lastOk: { morning_briefing: at("07:01"), stale_followups: at("08:01") } }))).toEqual([]);
    expect(dueRoles(input({ now: at("10:00"), lastOk: { morning_briefing: at("07:01"), stale_followups: at("08:01") } }))).toEqual(["stale_followups"]); // 11:00
    expect(dueRoles(input({ now: at("09:50"), lastOk: { morning_briefing: at("07:01"), stale_followups: at("08:01") } }))).toEqual([]); // 10:50
  });

  it("lets a missed slot go once the next one is near", () => {
    const done = { morning_briefing: at("07:01"), evening_report: at("20:01") };
    expect(dueRoles(input({ now: at("21:30"), lastOk: done }))).toEqual(["stale_followups"]); // 22:30: the 21:00 slot, 1.5 h late
    expect(dueRoles(input({ now: at("22:30"), lastOk: done }))).toEqual([]); // 23:30: 2.5 h late
  });

  it("gives the evening report from 21:00, once a day", () => {
    const rest = { morning_briefing: at("07:01"), stale_followups: at("19:01") };
    expect(dueRoles(input({ now: at("19:59"), lastOk: rest }))).toEqual([]); // 20:59
    expect(dueRoles(input({ now: at("20:00"), lastOk: rest }))).toEqual(["stale_followups", "evening_report"]); // 21:00: the last slot too
    expect(dueRoles(input({ now: at("20:20"), lastOk: { ...rest, evening_report: at("20:05"), stale_followups: at("20:05") } }))).toEqual([]);
  });

  it("tries a failed role again, three times a day at most", () => {
    expect(dueRoles(input({ now: at("07:05"), failuresToday: { morning_briefing: 2 } }))).toEqual(["morning_briefing"]);
    expect(dueRoles(input({ now: at("07:05"), failuresToday: { morning_briefing: 3 } }))).toEqual([]);
  });

  it("reads every time on the person's own clock", () => {
    expect(dueRoles(input({ now: at("07:00"), tz: "Europe/Warsaw" }))).toEqual(["morning_briefing"]);
    expect(dueRoles(input({ now: at("07:00"), tz: "America/New_York" }))).toEqual([]); // 02:00 there
    expect(dueRoles(input({ now: at("13:00"), tz: "America/New_York" }))).toEqual(["morning_briefing"]); // 08:00 there
  });
});
