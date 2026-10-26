const DAY = 86_400_000;

export interface BurndownTask {
  /** estimation, or 1 when the task has none */
  weight: number;
  /** when the task was completed, null while open */
  doneAt: Date | null;
}

export interface BurndownPoint {
  date: string; // YYYY-MM-DD
  ideal: number;
  actual: number | null; // null for days in the future
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const day = (d: Date) => Math.floor(d.getTime() / DAY) * DAY;

/**
 * Remaining work per day between start and due. Ideal falls linearly to zero;
 * actual subtracts a task's weight on the day it was completed. Capped at 120 days.
 */
export function buildBurndown(tasks: readonly BurndownTask[], start: Date, due: Date, today: Date): BurndownPoint[] {
  const total = tasks.reduce((s, t) => s + t.weight, 0);
  const first = day(start);
  const last = Math.max(day(due), first);
  const span = Math.min(Math.round((last - first) / DAY), 120);
  const now = day(today);
  const points: BurndownPoint[] = [];
  for (let i = 0; i <= span; i++) {
    const t = first + i * DAY;
    const done = tasks.filter((x) => x.doneAt && day(x.doneAt) <= t).reduce((s, x) => s + x.weight, 0);
    points.push({
      date: iso(t),
      ideal: span === 0 ? 0 : Math.round(total * (1 - i / span) * 100) / 100,
      actual: t <= now ? Math.round((total - done) * 100) / 100 : null,
    });
  }
  return points;
}
