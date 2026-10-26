const DAY = 86_400_000;

/** A timer that ran for less than 30 seconds records nothing; otherwise whole minutes, never less than 1. */
export function timerMinutes(startedAt: Date, stoppedAt: Date): number {
  const seconds = (stoppedAt.getTime() - startedAt.getTime()) / 1000;
  if (seconds < 30) return 0;
  return Math.min(Math.max(1, Math.round(seconds / 60)), 24 * 60);
}

/** Midnight UTC of the Monday of `d`'s week. */
export function weekStart(d: Date): Date {
  const day = Math.floor(d.getTime() / DAY) * DAY;
  const dow = (new Date(day).getUTCDay() + 6) % 7;
  return new Date(day - dow * DAY);
}

export function weekDays(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY));
}

export const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** "1h 30m", "45m", "2h" */
export function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h && r ? `${h}h ${r}m` : h ? `${h}h` : `${r}m`;
}

/**
 * Accepts what people type: "90", "1:30", "1h30m", "1.5h", "2h", "45m". Returns whole minutes or null.
 * A bare number is minutes.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  let minutes: number | null = null;
  let m: RegExpExecArray | null;
  if ((m = /^(\d+):([0-5]?\d)$/.exec(s))) minutes = Number(m[1]) * 60 + Number(m[2]);
  else if ((m = /^(\d+(?:\.\d+)?)\s*h(?:ours?)?(?:\s*([0-5]?\d)\s*m(?:in)?)?$/.exec(s))) minutes = Math.round(Number(m[1]) * 60) + Number(m[2] ?? 0);
  else if ((m = /^(\d+)\s*m(?:in(?:utes?)?)?$/.exec(s))) minutes = Number(m[1]);
  else if ((m = /^(\d+)$/.exec(s))) minutes = Number(m[1]);
  return minutes !== null && minutes >= 1 && minutes <= 24 * 60 ? minutes : null;
}

export interface EntryLike {
  minutes: number;
  billable: boolean;
  userId: string;
  projectId: string;
  date: Date;
}

export interface ReportRow {
  key: string;
  minutes: number;
  billableMinutes: number;
  amount: number;
}

/**
 * Hours and money per group. The rate for one entry is the project's own hourly rate if it has one, else the
 * person's; only billable minutes earn money. Rounded to cents once per group, not per entry.
 */
export function summarize(entries: readonly EntryLike[], groupBy: "project" | "user" | "day", rateFor: (e: EntryLike) => number): ReportRow[] {
  const groups = new Map<string, { minutes: number; billable: number; amount: number }>();
  for (const e of entries) {
    const key = groupBy === "project" ? e.projectId : groupBy === "user" ? e.userId : dayKey(e.date);
    const g = groups.get(key) ?? { minutes: 0, billable: 0, amount: 0 };
    g.minutes += e.minutes;
    if (e.billable) {
      g.billable += e.minutes;
      g.amount += (e.minutes / 60) * rateFor(e);
    }
    groups.set(key, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ key, minutes: g.minutes, billableMinutes: g.billable, amount: Math.round(g.amount * 100) / 100 }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
