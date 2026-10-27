import type { Plan } from "@prisma/client";

/** Where a workspace's Pro can come from, besides the lasting plan. Each of the three has an end date. */
export const TIMED_SOURCES = ["trial", "bonus", "gift"] as const;
export type TimedSource = (typeof TIMED_SOURCES)[number];

export const TRIAL_DAYS = 14;
/** Bonus points that make one month of Pro. */
export const POINTS_PER_MONTH = 3;
export const MONTH_DAYS = 30;
const DAY = 86_400_000;

export interface PlanSources {
  basePlan: Plan;
  trialEndsAt: Date | null;
  bonusUntil: Date | null;
  giftUntil: Date | null;
}

const RANK: Record<Plan, number> = { FREE: 0, PRO: 1, ENTERPRISE: 2 };
const best = (a: Plan, b: Plan): Plan => (RANK[a] >= RANK[b] ? a : b);

export const isActive = (until: Date | null, now: Date): boolean => !!until && until.getTime() > now.getTime();

/**
 * The plan in force: the lasting plan, or Pro while any of the time-limited sources is still running.
 * `open`: paid plans are not in force for this workspace, so it has everything (Pro) whatever it has paid.
 */
export function effectivePlan(s: PlanSources, now: Date, open = false): Plan {
  let plan = open ? best(s.basePlan, "PRO") : s.basePlan;
  if (isActive(s.trialEndsAt, now) || isActive(s.bonusUntil, now) || isActive(s.giftUntil, now)) plan = best(plan, "PRO");
  return plan;
}

/** The running time-limited sources, soonest end first, for showing where Pro comes from. */
export function activeSources(s: PlanSources, now: Date): { source: TimedSource; until: Date }[] {
  return TIMED_SOURCES.flatMap((source) => {
    const until = source === "trial" ? s.trialEndsAt : source === "bonus" ? s.bonusUntil : s.giftUntil;
    return isActive(until, now) ? [{ source, until: until as Date }] : [];
  }).sort((a, b) => a.until.getTime() - b.until.getTime());
}

/** Whole days left until `until`, counting a started day (never negative). */
export function daysLeft(until: Date | null, now: Date): number {
  return until ? Math.max(0, Math.ceil((until.getTime() - now.getTime()) / DAY)) : 0;
}

/** Adds `months` of Pro to the bonus end date: from now, or from where it already ends if that is later. */
export function extendBonus(current: Date | null, months: number, now: Date): Date {
  const from = current && current.getTime() > now.getTime() ? current.getTime() : now.getTime();
  return new Date(from + months * MONTH_DAYS * DAY);
}

export const trialEnd = (now: Date): Date => new Date(now.getTime() + TRIAL_DAYS * DAY);
