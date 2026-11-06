import { describe, expect, it } from "vitest";
import { meetingChoices } from "@/modules/crm/meeting-times";

describe("one-press meeting times", () => {
  it("in the morning: tonight, tomorrow noon, tomorrow evening (in the person's zone)", () => {
    const c = meetingChoices("Europe/Warsaw", new Date("2026-11-07T09:00:00Z"));
    expect(c).toEqual([
      { key: "today19", day: "2026-11-07", time: "19:00" },
      { key: "tomorrow12", day: "2026-11-08", time: "12:00" },
      { key: "tomorrow19", day: "2026-11-08", time: "19:00" },
    ]);
  });
  it("late in the day tonight is no longer offered", () => {
    expect(meetingChoices("Europe/Warsaw", new Date("2026-11-07T18:30:00Z")).map((c) => c.key)).toEqual(["tomorrow12", "tomorrow19"]);
  });
});
