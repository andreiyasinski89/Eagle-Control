import { describe, expect, it } from "vitest";
import { computeTemperature, manualHolds, manualUntil, MANUAL_HOLD_DAYS, temperatureOf, type TempActivity, type TempContact } from "@/modules/crm/temperature";

const NOW = new Date("2026-11-10T12:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const person = (over: Partial<TempContact> = {}): TempContact => ({ stage: "NEW", createdAt: ago(60), lastContactedAt: null, stageChangedAt: null, ...over });
const touch = (daysBack: number, over: Partial<TempActivity> = {}): TempActivity => ({ type: "MESSAGE", completedAt: ago(daysBack), ...over });
const run = (c: TempContact, a: TempActivity[] = []) => computeTemperature(c, a, NOW);

describe("how warm a person is", () => {
  it("a name just written down, never contacted, is cold", () => {
    expect(run(person()).temperature).toBe("COLD");
  });

  it("the thresholds: 6 is hot, 3 is warm, less is cold", () => {
    expect(temperatureOf(6)).toBe("HOT");
    expect(temperatureOf(5.5)).toBe("WARM");
    expect(temperatureOf(3)).toBe("WARM");
    expect(temperatureOf(2.5)).toBe("COLD");
  });

  it("someone who replied twice and is being talked to is hot", () => {
    const r = run(person({ stage: "WARMING", lastContactedAt: ago(1) }), [touch(1, { outcome: "REPLIED" }), touch(2, { outcome: "REPLIED" })]);
    expect(r.temperature).toBe("HOT"); // 2 stage + 4 replies + 1 touches
    expect(r.reasons[0]).toBe("replies");
  });

  it("a meeting held makes someone at the presentation stage hot, until it is old", () => {
    const stage = person({ stage: "PRESENTATION", lastContactedAt: ago(2) });
    expect(run(stage, [touch(2, { type: "MEETING" })]).temperature).toBe("HOT"); // 3 + 3 + 0.5
    expect(run({ ...stage, lastContactedAt: ago(70) }, [touch(70, { type: "MEETING" })]).temperature).toBe("COLD"); // the meeting is too old to count, and the silence is long
  });

  it("a question about the price counts for two weeks", () => {
    const base = person({ stage: "FIRST_CONTACT", lastContactedAt: ago(1) });
    expect(run(base, [touch(1, { signals: ["PRICE_QUESTION"] })]).temperature).toBe("WARM"); // 1 + 3 + 0.5
    expect(run({ ...base, lastContactedAt: ago(20) }, [touch(20, { signals: ["PRICE_QUESTION"] })]).temperature).toBe("COLD");
  });

  it("an agreed meeting is a strong signal", () => {
    const r = run(person({ stage: "FIRST_CONTACT", lastContactedAt: ago(0) }), [touch(0, { outcome: "MEETING_SET" })]);
    expect(r.temperature).toBe("WARM"); // 1 + 3 + 0.5
    expect(r.reasons).toContain("meeting_set");
  });

  it("silence cools a person step by step", () => {
    const hot = (days: number) => run(person({ stage: "DECIDING", lastContactedAt: ago(days) }), [touch(days, { outcome: "REPLIED" }), touch(days + 1, { outcome: "REPLIED" })]);
    expect(hot(1).temperature).toBe("HOT"); // 4 + 4 + 1
    expect(hot(6).score).toBe(hot(1).score - 1);
    expect(hot(12).score).toBe(hot(1).score - 2);
    expect(hot(25).score).toBe(hot(1).score - 3);
    expect(hot(40).score).toBe(0); // the touches and replies are older than a month and no longer count: 4 for the stage, 4 off for the silence
    expect(hot(40).temperature).toBe("COLD");
  });

  it("messages left without an answer cool a person: two in a row a little, three or more a lot", () => {
    const c = person({ stage: "WARMING", lastContactedAt: ago(1) });
    const one = run(c, [touch(1, { outcome: "NO_REPLY" })]).score;
    const two = run(c, [touch(1, { outcome: "NO_REPLY" }), touch(3, { outcome: "NO_REPLY" })]).score;
    const three = run(c, [touch(1, { outcome: "NO_REPLY" }), touch(3, { outcome: "NO_REPLY" }), touch(5, { outcome: "NO_REPLY" })]).score;
    expect(one).toBe(2.5); // stage 2 + half a point
    expect(two).toBe(2); // 2 + 1 - 1
    expect(three).toBe(0.5); // 2 + 1.5 - 3
    // an answer in between ends the run
    expect(run(c, [touch(1, { outcome: "NO_REPLY" }), touch(2, { outcome: "REPLIED" }), touch(3, { outcome: "NO_REPLY" }), touch(4, { outcome: "NO_REPLY" })]).reasons).not.toContain("unanswered");
  });

  it("a move forward in the funnel counts for two weeks", () => {
    const moved = person({ stage: "WARMING", previousStage: "FIRST_CONTACT", stageChangedAt: ago(3) });
    const back = person({ stage: "FIRST_CONTACT", previousStage: "WARMING", stageChangedAt: ago(3) });
    expect(run(moved).reasons).toContain("moved_forward");
    expect(run(back).reasons).not.toContain("moved_forward");
    expect(run({ ...moved, stageChangedAt: ago(20) }).reasons).not.toContain("moved_forward");
  });

  it("those who said no or do not answer are cold, clients and partners have no temperature", () => {
    expect(run(person({ stage: "DECLINED" }), [touch(1, { outcome: "REPLIED" })]).temperature).toBe("COLD");
    expect(run(person({ stage: "NO_REPLY" })).temperature).toBe("COLD");
    expect(run(person({ stage: "CLIENT" })).temperature).toBeNull();
    expect(run(person({ stage: "PARTNER" })).temperature).toBeNull();
  });

  it("only what is done counts: a planned touch, a note or a task does not", () => {
    const c = person({ stage: "WARMING" });
    const plain = run(c).score;
    expect(run(c, [{ type: "MESSAGE", completedAt: null }, touch(1, { type: "NOTE" }), touch(1, { type: "TASK" })]).score).toBe(plain);
    expect(run(c, [{ type: "MESSAGE", completedAt: new Date(NOW.getTime() + 86_400_000) }]).score).toBe(plain); // not yet
  });

  it("the touches count half a point each, up to two", () => {
    const c = person({ stage: "WARMING", lastContactedAt: ago(1) });
    expect(run(c, [touch(1)]).score).toBe(2.5);
    expect(run(c, [touch(1), touch(2), touch(3), touch(4), touch(5), touch(6), touch(7)]).score).toBe(4 - 2 + 2 - 0); // the 4 touches that matter cap at 2; the last one was 1 day ago
  });

  it("a person written to but never answered cools with the silence, one never written to does not", () => {
    expect(run(person({ stage: "WARMING" })).score).toBe(2);
    expect(run(person({ stage: "WARMING", lastContactedAt: ago(20) })).score).toBe(-1); // 2 - 3
  });
});

describe("a temperature set by hand", () => {
  it("holds for 14 days and then lets go", () => {
    const until = manualUntil(NOW);
    expect(until.getTime() - NOW.getTime()).toBe(MANUAL_HOLD_DAYS * 86_400_000);
    expect(manualHolds(until, NOW)).toBe(true);
    expect(manualHolds(until, new Date(until.getTime() - 1))).toBe(true);
    expect(manualHolds(until, until)).toBe(false);
    expect(manualHolds(null, NOW)).toBe(false);
    expect(manualHolds(undefined, NOW)).toBe(false);
  });
});
