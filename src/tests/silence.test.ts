import { describe, expect, it } from "vitest";
import { compareSilence, evaluateSilence, type SilenceInput } from "@/modules/crm/silence";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);
const ahead = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

const person = (over: Partial<SilenceInput> = {}): SilenceInput => ({ stage: "WARMING", temperature: "WARM", lastContactedAt: ago(1), stageChangedAt: ago(24 * 20), repliedAt: null, nextMeetingAt: null, ...over });

describe("Stage timers", () => {
  it.each([
    ["WARMING", 4, "warming"],
    ["DECIDING", 2, "deciding"],
    ["NO_REPLY", 7, "no_reply"],
    ["DECLINED", 45, "declined"],
  ] as const)("%s fires after %i days without a touch, not a minute before", (stage, days, kind) => {
    expect(evaluateSilence(person({ stage, lastContactedAt: ago(days * 24 - 1) }), NOW)).toBeNull();
    expect(evaluateSilence(person({ stage, lastContactedAt: ago(days * 24) }), NOW)).toMatchObject({ kind, silentHours: days * 24, overdueHours: 0 });
    expect(evaluateSilence(person({ stage, lastContactedAt: ago(days * 24 + 10) }), NOW)).toMatchObject({ kind, overdueHours: 10 });
  });

  it("counts from the stage change when the person was never touched", () => {
    expect(evaluateSilence(person({ stage: "WARMING", lastContactedAt: null, stageChangedAt: ago(24 * 5) }), NOW)).toMatchObject({ kind: "warming", silentHours: 120 });
    expect(evaluateSilence(person({ stage: "WARMING", lastContactedAt: null, stageChangedAt: ago(24 * 2) }), NOW)).toBeNull();
  });

  it.each(["NEW", "FIRST_CONTACT", "PRESENTATION", "CLIENT", "PARTNER"] as const)("%s has no silence timer of its own", (stage) => {
    expect(evaluateSilence(person({ stage, lastContactedAt: ago(24 * 90) }), NOW)).toBeNull();
  });
});

describe("A reply", () => {
  it("is a red flag after 24 hours without our answer, on any stage", () => {
    expect(evaluateSilence(person({ stage: "NEW", repliedAt: ago(23) , lastContactedAt: ago(30) }), NOW)).toBeNull();
    expect(evaluateSilence(person({ stage: "NEW", repliedAt: ago(24), lastContactedAt: ago(30) }), NOW)).toMatchObject({ kind: "replied", silentHours: 24, overdueHours: 0 });
    expect(evaluateSilence(person({ stage: "CLIENT", repliedAt: ago(50), lastContactedAt: null }), NOW)).toMatchObject({ kind: "replied", overdueHours: 26 });
  });

  it("is answered by any later touch of ours", () => {
    expect(evaluateSilence(person({ stage: "NEW", repliedAt: ago(40), lastContactedAt: ago(10) }), NOW)).toBeNull();
  });

  it("outranks the stage timer", () => {
    expect(evaluateSilence(person({ stage: "WARMING", repliedAt: ago(30), lastContactedAt: ago(24 * 6) }), NOW)?.kind).toBe("replied");
  });
});

describe("Booked presentation", () => {
  it("is reminded about in the two hours before it", () => {
    expect(evaluateSilence(person({ stage: "PRESENTATION", nextMeetingAt: ahead(1.5) }), NOW)).toMatchObject({ kind: "meeting_soon" });
    expect(evaluateSilence(person({ stage: "PRESENTATION", nextMeetingAt: ahead(2) }), NOW)).toMatchObject({ kind: "meeting_soon" });
    expect(evaluateSilence(person({ stage: "PRESENTATION", nextMeetingAt: ahead(3) }), NOW)).toBeNull();
    expect(evaluateSilence(person({ stage: "PRESENTATION", nextMeetingAt: ago(0.5) }), NOW)).toBeNull();
    expect(evaluateSilence(person({ stage: "DECIDING", lastContactedAt: ago(1), nextMeetingAt: ahead(1) }), NOW)).toBeNull();
  });
});

describe("Order", () => {
  it("puts replies first, then the meeting, then by stage; hotter and longer overdue go first inside a kind", () => {
    const hit = (over: Partial<SilenceInput>) => ({ temperature: over.temperature ?? ("WARM" as const), hit: evaluateSilence(person(over), NOW)! });
    const list = [
      { n: "warming-cold", ...hit({ stage: "WARMING", temperature: "COLD", lastContactedAt: ago(24 * 9) }) },
      { n: "deciding", ...hit({ stage: "DECIDING", lastContactedAt: ago(24 * 3) }) },
      { n: "warming-hot", ...hit({ stage: "WARMING", temperature: "HOT", lastContactedAt: ago(24 * 5) }) },
      { n: "replied", ...hit({ stage: "NEW", repliedAt: ago(30), lastContactedAt: null }) },
      { n: "warming-hot-longer", ...hit({ stage: "WARMING", temperature: "HOT", lastContactedAt: ago(24 * 8) }) },
      { n: "meeting", ...hit({ stage: "PRESENTATION", nextMeetingAt: ahead(1) }) },
    ];
    expect(list.sort(compareSilence).map((x) => x.n)).toEqual(["replied", "meeting", "deciding", "warming-hot-longer", "warming-hot", "warming-cold"]);
  });
});
