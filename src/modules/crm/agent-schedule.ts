import { zonedParts, zonedToUtc } from "@/modules/views/tz";
import type { AgentSettings } from "./agent-settings";

/** The roles the clock runs by itself. Voice logs and the like start from a person's action. */
export type ScheduledRole = "morning_briefing" | "stale_followups" | "evening_report";

/** After this many failed runs of one role in a day it is left alone until tomorrow. */
export const MAX_FAILURES_PER_DAY = 3;
/** A briefing that missed its time by more than this is no longer a morning briefing. */
const BRIEFING_WINDOW_MINUTES = 180;
/** The follow-up keeper wakes at these local hours, every two hours. */
export const FOLLOW_UP_HOURS = [9, 11, 13, 15, 17, 19, 21];
/** A follow-up slot that was missed by more than this is skipped: the next one comes soon. */
const SLOT_WINDOW_MS = 2 * 3_600_000;
const EVENING_MINUTES = 21 * 60;

const pad = (n: number) => String(n).padStart(2, "0");
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export interface DueInput {
  settings: AgentSettings;
  /** The person's time zone: every time below is read on their wall clock. */
  tz: string;
  now: Date;
  /** When each role last finished without an error. */
  lastOk: Partial<Record<ScheduledRole, Date>>;
  /** How many runs of each role failed since the person's day began. */
  failuresToday: Partial<Record<ScheduledRole, number>>;
}

/**
 * Which roles are due for one person right now: the morning briefing at their time (once a day), the follow-up keeper
 * every two hours from 09:00 to 21:00, the evening report from 21:00 (once a day). Nothing is due when the agent is off.
 * A run that failed is tried again at the next tick, up to MAX_FAILURES_PER_DAY times, then left until tomorrow.
 */
export function dueRoles(i: DueInput): ScheduledRole[] {
  if (!i.settings.enabled) return [];
  const { day, minutes } = zonedParts(i.now, i.tz);
  const doneToday = (r: ScheduledRole) => {
    const at = i.lastOk[r];
    return !!at && zonedParts(at, i.tz).day === day;
  };
  const tired = (r: ScheduledRole) => (i.failuresToday[r] ?? 0) >= MAX_FAILURES_PER_DAY;
  const due: ScheduledRole[] = [];

  const briefing = minutesOf(i.settings.briefingTime);
  if (minutes >= briefing && minutes < briefing + BRIEFING_WINDOW_MINUTES && !doneToday("morning_briefing") && !tired("morning_briefing")) due.push("morning_briefing");

  const slot = FOLLOW_UP_HOURS.map((h) => zonedToUtc(day, `${pad(h)}:00`, i.tz)).filter((s) => s.getTime() <= i.now.getTime()).at(-1);
  const last = i.lastOk.stale_followups;
  if (slot && i.now.getTime() - slot.getTime() < SLOT_WINDOW_MS && (!last || last.getTime() < slot.getTime()) && !tired("stale_followups")) due.push("stale_followups");

  if (minutes >= EVENING_MINUTES && !doneToday("evening_report") && !tired("evening_report")) due.push("evening_report");
  return due;
}
