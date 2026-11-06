import { describe, expect, it } from "vitest";
import { awaitsAnswer } from "@/modules/crm/reply";
import { whenLabel } from "@/features/crm/format";

describe("waiting for our answer", () => {
  it("a reply with no touch of ours after it waits; a touch after it ends the wait; no reply never waits", () => {
    expect(awaitsAnswer("2026-11-06T10:00:00Z", null)).toBe(true);
    expect(awaitsAnswer("2026-11-06T10:00:00Z", "2026-11-05T10:00:00Z")).toBe(true);
    expect(awaitsAnswer("2026-11-06T10:00:00Z", "2026-11-06T11:00:00Z")).toBe(false);
    expect(awaitsAnswer(null, "2026-11-06T11:00:00Z")).toBe(false);
    expect(awaitsAnswer(null, null)).toBe(false);
  });
});

describe("dates as people say them", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  it("today and yesterday by word, without seconds, in the person's time zone", () => {
    expect(whenLabel("2026-11-07T09:05:30Z", "ru", "Europe/Warsaw", now)).toBe("сегодня, 10:05");
    expect(whenLabel("2026-11-06T22:11:55Z", "ru", "Europe/Warsaw", now)).toBe("вчера, 23:11");
    expect(whenLabel("2026-11-06T22:11:55Z", "en", "UTC", now)).toBe("yesterday, 10:11 PM") // English keeps its own 12-hour clock;
  });
  it("an earlier day shows day and month; the year only when it is another year", () => {
    expect(whenLabel("2026-10-27T13:57:19Z", "ru", "UTC", now)).toMatch(/^27 окт\.?, 13:57$/);
    expect(whenLabel("2025-10-27T13:57:19Z", "ru", "UTC", now)).toContain("2025");
  });
  it("a broken time zone falls back to UTC instead of breaking the page", () => {
    expect(whenLabel("2026-11-07T09:05:00Z", "en", "Not/AZone", now)).toBe("today, 09:05 AM");
  });
});
