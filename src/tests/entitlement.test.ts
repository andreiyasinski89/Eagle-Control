import { describe, expect, it } from "vitest";
import { activeSources, daysLeft, effectivePlan, extendBonus, isActive, trialEnd, TRIAL_DAYS, type PlanSources } from "@/modules/plans/entitlement";

const now = new Date("2026-11-02T12:00:00Z");
const day = (n: number) => new Date(now.getTime() + n * 86_400_000);
const src = (extra: Partial<PlanSources> = {}): PlanSources => ({ basePlan: "FREE", trialEndsAt: null, bonusUntil: null, giftUntil: null, ...extra });

describe("the plan in force", () => {
  it("is the lasting plan when nothing time-limited runs", () => {
    expect(effectivePlan(src(), now)).toBe("FREE");
    expect(effectivePlan(src({ basePlan: "PRO" }), now)).toBe("PRO");
    expect(effectivePlan(src({ basePlan: "ENTERPRISE" }), now)).toBe("ENTERPRISE");
  });
  it("is Pro while a trial, a bonus or a gift runs, from any one of them", () => {
    expect(effectivePlan(src({ trialEndsAt: day(5) }), now)).toBe("PRO");
    expect(effectivePlan(src({ bonusUntil: day(1) }), now)).toBe("PRO");
    expect(effectivePlan(src({ giftUntil: day(30) }), now)).toBe("PRO");
  });
  it("falls back when they have ended, at the very moment they end", () => {
    expect(effectivePlan(src({ trialEndsAt: day(-1), bonusUntil: day(-2), giftUntil: day(-3) }), now)).toBe("FREE");
    expect(effectivePlan(src({ trialEndsAt: now }), now)).toBe("FREE");
  });
  it("never lowers a lasting plan, and Enterprise stays above a trial", () => {
    expect(effectivePlan(src({ basePlan: "ENTERPRISE", trialEndsAt: day(5) }), now)).toBe("ENTERPRISE");
    expect(effectivePlan(src({ basePlan: "PRO", trialEndsAt: day(-5) }), now)).toBe("PRO");
  });
});

describe("where Pro comes from", () => {
  it("lists the running sources, soonest end first", () => {
    const s = activeSources(src({ trialEndsAt: day(9), bonusUntil: day(3), giftUntil: day(-1) }), now);
    expect(s.map((x) => x.source)).toEqual(["bonus", "trial"]);
  });
  it("counts days left as whole days, a started day counting, never below zero", () => {
    expect(daysLeft(day(3), now)).toBe(3);
    expect(daysLeft(new Date(now.getTime() + 3_600_000), now)).toBe(1);
    expect(daysLeft(day(-2), now)).toBe(0);
    expect(daysLeft(null, now)).toBe(0);
    expect(isActive(null, now)).toBe(false);
  });
  it("a trial lasts 14 days", () => {
    expect(TRIAL_DAYS).toBe(14);
    expect(trialEnd(now).getTime() - now.getTime()).toBe(14 * 86_400_000);
  });
});

describe("bonus months", () => {
  it("add 30 days from now, or from where the bonus already ends", () => {
    expect(extendBonus(null, 1, now)).toEqual(day(30));
    expect(extendBonus(day(-5), 1, now)).toEqual(day(30));
    expect(extendBonus(day(10), 2, now)).toEqual(day(70));
  });
});
