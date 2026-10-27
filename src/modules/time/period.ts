import { addDays } from "@/modules/crm/tracker";
import { todayIn, zonedToUtc } from "@/modules/views/tz";

export const PERIODS = ["day", "week", "month", "all"] as const;
export type Period = (typeof PERIODS)[number];

/** The first and last day (YYYY-MM-DD) of the period around `day`; null for "all time". Weeks run Monday to Sunday. */
export function periodRange(period: Period, day: string): { from: string; to: string } | null {
  if (period === "all") return null;
  if (period === "day") return { from: day, to: day };
  if (period === "week") {
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    const from = addDays(day, -((dow + 6) % 7));
    return { from, to: addDays(from, 6) };
  }
  const [y, m] = day.split("-").map(Number) as [number, number];
  const from = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-01`;
  return { from, to: addDays(next, -1) };
}

/** Every day from `from` to `to`, inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The day to show after moving one step back or forward from `day` in the given period. */
export function shiftPeriod(period: Period, day: string, steps: number): string {
  if (period === "day") return addDays(day, steps);
  if (period === "week") return addDays(day, steps * 7);
  if (period === "month") {
    const [y, m, d] = day.split("-").map(Number) as [number, number, number];
    const idx = y * 12 + (m - 1) + steps;
    const ny = Math.floor(idx / 12);
    const nm = (idx % 12) + 1;
    const last = Number(periodRange("month", `${ny}-${String(nm).padStart(2, "0")}-01`)?.to.slice(8));
    return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  }
  return day;
}

/**
 * Cuts the time between a start and a stop into the person's own calendar days, so a timer left running over midnight
 * is counted on both days. The whole minutes add up to what the timer reports (under 30 seconds: nothing).
 */
export function splitByLocalDays(start: Date, end: Date, tz: string, wholeMinutes: number): { day: string; minutes: number }[] {
  if (wholeMinutes <= 0 || end.getTime() <= start.getTime()) return [];
  const parts: { day: string; seconds: number }[] = [];
  let cursor = start;
  let day = todayIn(tz, cursor);
  for (let i = 0; i < 400 && cursor.getTime() < end.getTime(); i++) {
    const boundary = zonedToUtc(addDays(day, 1), "00:00", tz);
    const stop = boundary.getTime() < end.getTime() ? boundary : end;
    parts.push({ day, seconds: (stop.getTime() - cursor.getTime()) / 1000 });
    cursor = stop;
    day = addDays(day, 1);
  }
  const total = parts.reduce((s, p) => s + p.seconds, 0);
  // Largest-remainder rounding: every part gets its share of the whole minutes, and the shares add up exactly.
  const raw = parts.map((p) => (p.seconds / total) * wholeMinutes);
  const floors = raw.map(Math.floor);
  let left = wholeMinutes - floors.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const o of order) {
    if (left <= 0) break;
    floors[o.i] = (floors[o.i] as number) + 1;
    left--;
  }
  return parts.map((p, i) => ({ day: p.day, minutes: floors[i] as number })).filter((p) => p.minutes > 0);
}
