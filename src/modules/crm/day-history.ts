import { addDays } from "./tracker";

/** The spans the history can be looked at: yesterday, this week, 30 days, a year, and everything there is. */
export const HISTORY_PERIODS = ["yesterday", "week", "30d", "year", "all"] as const;
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];

/** One saved day: what was planned and done, and the two percentages (see `dayScore`). */
export interface DayRow {
  /** The person's own day, YYYY-MM-DD. */
  day: string;
  planned: number;
  done: number;
  tasks: { planned: number; done: number };
  meetings: { planned: number; done: number };
  followUps: { planned: number; done: number };
  backlogOpen: number;
  backlogCleared: number;
  trackedMinutes: number;
  efficiency: number | null;
  productivity: number | null;
}

/** A point of the chart: a day, or a week (then `days` says how many saved days it is made of). */
export interface Point {
  from: string;
  to: string;
  efficiency: number | null;
  productivity: number | null;
  days: number;
}

export interface Average {
  efficiency: number | null;
  productivity: number | null;
  days: number;
}

export interface Range {
  from: string;
  to: string;
  /** The span of the same length just before, to say whether things got better; none for "all". */
  prev: { from: string; to: string } | null;
  bucket: "day" | "week";
}

/** The Monday of the week a day belongs to. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 is Sunday
  return addDays(day, -((dow + 6) % 7));
}

const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

/** The span of a period for a person whose today is `today`; `first` is their oldest saved day (for "all"). */
export function periodRange(period: HistoryPeriod, today: string, first: string | null): Range {
  switch (period) {
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y, prev: { from: addDays(y, -1), to: addDays(y, -1) }, bucket: "day" };
    }
    case "week": {
      const from = weekStart(today);
      return { from, to: today, prev: { from: addDays(from, -7), to: addDays(from, -1) }, bucket: "day" };
    }
    case "30d": {
      const from = addDays(today, -29);
      return { from, to: today, prev: { from: addDays(from, -30), to: addDays(from, -1) }, bucket: "day" };
    }
    case "year": {
      const from = addDays(today, -364);
      return { from, to: today, prev: { from: addDays(from, -365), to: addDays(from, -1) }, bucket: "week" };
    }
    default: {
      const from = first && first <= today ? first : today;
      return { from, to: today, prev: null, bucket: daysBetween(from, today) > 90 ? "week" : "day" };
    }
  }
}

const mean = (v: (number | null)[]): number | null => {
  const n = v.filter((x): x is number => x !== null);
  return n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length) : null;
};

/** The average of the saved days: each day counts once, and a day that wanted nothing from the person is not a zero. */
export function average(rows: readonly DayRow[]): Average {
  return { efficiency: mean(rows.map((r) => r.efficiency)), productivity: mean(rows.map((r) => r.productivity)), days: rows.length };
}

/** Better, worse or the same (within one point), or `null` when either side has no days to compare. */
export function trend(now: number | null, before: number | null): "up" | "down" | "same" | null {
  if (now === null || before === null) return null;
  const d = now - before;
  return Math.abs(d) <= 1 ? "same" : d > 0 ? "up" : "down";
}

/** The chart: one point for every day of the span (an empty one where nothing was saved), or one for every week with the average of its days. */
export function buildPoints(rows: readonly DayRow[], range: Range): Point[] {
  const inside = rows.filter((r) => r.day >= range.from && r.day <= range.to);
  if (range.bucket === "day") {
    const by = new Map(inside.map((r) => [r.day, r]));
    const out: Point[] = [];
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
      const r = by.get(d);
      out.push({ from: d, to: d, efficiency: r?.efficiency ?? null, productivity: r?.productivity ?? null, days: r ? 1 : 0 });
    }
    return out;
  }
  const weeks = new Map<string, DayRow[]>();
  for (const r of inside) weeks.set(weekStart(r.day), [...(weeks.get(weekStart(r.day)) ?? []), r]);
  const out: Point[] = [];
  for (let w = weekStart(range.from); w <= range.to; w = addDays(w, 7)) {
    const list = weeks.get(w) ?? [];
    const a = average(list);
    out.push({ from: w < range.from ? range.from : w, to: addDays(w, 6) > range.to ? range.to : addDays(w, 6), efficiency: a.efficiency, productivity: a.productivity, days: list.length });
  }
  return out;
}
