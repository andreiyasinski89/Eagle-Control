import { zonedParts, zonedToUtc } from "@/modules/views/tz";

/** Planning a call or a meeting with a contact: what the form holds, its defaults, and the activity it turns into. Hours are the person's own; what is stored is UTC. */

export const SCHEDULE_KINDS = ["CALL", "MEETING"] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];
export const DURATIONS = [15, 30, 45, 60, 90, 120] as const;

export interface ScheduleForm {
  kind: ScheduleKind;
  subject: string;
  /** YYYY-MM-DD in the person's zone */
  day: string;
  /** HH:MM in the person's zone */
  time: string;
  durationMin: number;
  body: string;
}

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** The next full hour in the person's zone; late in the evening, 09:00 the next day. */
export function defaultSlot(now: Date, tz: string): { day: string; time: string } {
  const p = zonedParts(now, tz);
  const next = Math.floor(p.minutes / 60) + 1;
  if (next >= 21) {
    const tomorrow = zonedParts(new Date(now.getTime() + 86_400_000), tz).day;
    return { day: tomorrow, time: "09:00" };
  }
  return { day: p.day, time: `${String(next).padStart(2, "0")}:00` };
}

export type ScheduleProblem = "subject" | "day" | "time" | "duration";

export interface ScheduledActivity {
  type: ScheduleKind;
  subject: string;
  body: string | null;
  dueAt: string;
  durationMin: number;
  /** A planned call is open until someone does it, even if the minute has just passed. */
  completed: false;
}

export function buildScheduled(f: ScheduleForm, tz: string): { ok: true; input: ScheduledActivity } | { ok: false; problem: ScheduleProblem } {
  const subject = f.subject.trim();
  if (!subject) return { ok: false, problem: "subject" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.day) || Number.isNaN(Date.parse(`${f.day}T00:00:00Z`))) return { ok: false, problem: "day" };
  if (!CLOCK.test(f.time)) return { ok: false, problem: "time" };
  if (!Number.isInteger(f.durationMin) || f.durationMin < 5 || f.durationMin > 1440) return { ok: false, problem: "duration" };
  return { ok: true, input: { type: f.kind, subject: subject.slice(0, 200), body: f.body.trim() || null, dueAt: zonedToUtc(f.day, f.time, tz).toISOString(), durationMin: f.durationMin, completed: false } };
}
