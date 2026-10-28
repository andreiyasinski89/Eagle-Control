import { zonedParts } from "@/modules/views/tz";
import type { Repeat } from "./repeat";

/**
 * Finds the events that are really one series entered date by date: the same title, hour and length, falling on a regular rhythm
 * (every week, every second week, every day, every month). A series needs at least three dates. Weekly ones may have a few holes;
 * those dates become "skipped". Nothing is changed here: the caller shows the finding and merges only what the person confirms.
 */
export interface EventRow {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  attendeeIds?: string[];
  /** Already a series: left alone. */
  repeating?: boolean;
}

export interface Series {
  /** The earliest event: it stays and becomes the series. */
  keepId: string;
  /** Every other event of the finding: they are archived when merged. */
  dropIds: string[];
  title: string;
  /** How many dates the series covers (holes not counted). */
  count: number;
  first: string;
  last: string;
  time: string;
  rule: Repeat;
  attendeeIds: string[];
}

const MIN = 3;
const DAY = 86_400_000;
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / DAY;
const dayString = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

interface Item {
  row: EventRow;
  day: string;
  time: string;
  minutes: number | null;
  start: number;
}

function build(items: Item[], rule: Repeat, taken: Set<string>): Series {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const keep = sorted[0] as Item;
  const last = sorted[sorted.length - 1] as Item;
  const days = new Set(sorted.map((i) => i.day));
  const attendees = new Set<string>();
  for (const i of sorted) for (const a of i.row.attendeeIds ?? []) attendees.add(a);
  for (const i of sorted) taken.add(i.row.id);
  return {
    keepId: keep.row.id,
    dropIds: sorted.slice(1).map((i) => i.row.id),
    title: keep.row.title,
    count: days.size,
    first: keep.day,
    last: last.day,
    time: keep.time,
    rule,
    attendeeIds: [...attendees],
  };
}

/** One entry per day: a second event on the same day with the same title is a duplicate of it, and goes with the series. */
const perDay = (items: Item[]): Item[] => [...new Map(items.slice().sort((a, b) => a.start - b.start).map((i) => [i.day, i])).values()];

export function detectSeries(rows: readonly EventRow[], tz: string): Series[] {
  const items: Item[] = [];
  for (const row of rows) {
    if (row.repeating) continue;
    const t = Date.parse(row.startsAt);
    if (Number.isNaN(t)) continue;
    const p = zonedParts(new Date(t), tz);
    const e = row.endsAt ? Date.parse(row.endsAt) : NaN;
    items.push({ row, day: p.day, time: p.time, minutes: Number.isNaN(e) ? null : Math.round((e - t) / 60_000), start: t });
  }
  const taken = new Set<string>();
  const out: Series[] = [];
  const group = (key: (i: Item) => string, pool: Item[]) => {
    const m = new Map<string, Item[]>();
    for (const i of pool) m.set(key(i), [...(m.get(key(i)) ?? []), i]);
    return [...m.values()];
  };
  const base = (i: Item) => `${norm(i.row.title)}|${i.time}|${i.minutes ?? "-"}`;
  const weekday = (i: Item) => new Date(`${i.day}T00:00:00Z`).getUTCDay();

  // Weekly (and every second week, ...): same weekday, gaps that are whole weeks, a few dates may be missing.
  for (const g of group((i) => `${base(i)}|${weekday(i)}`, items)) {
    const days = perDay(g);
    if (days.length < MIN) continue;
    const gaps = days.slice(1).map((d, k) => dayNumber(d.day) - dayNumber((days[k] as Item).day));
    const step = gaps.reduce(gcd, 0);
    if (step < 7 || step % 7 !== 0 || step / 7 > 12) continue;
    const expected = (dayNumber((days[days.length - 1] as Item).day) - dayNumber((days[0] as Item).day)) / step + 1;
    const missing = expected - days.length;
    if (missing > Math.floor(days.length / 3)) continue;
    const present = new Set(days.map((d) => d.day));
    const skip: string[] = [];
    for (let n = 0; n < expected; n++) {
      const day = dayString(dayNumber((days[0] as Item).day) + n * step);
      if (!present.has(day)) skip.push(day);
    }
    out.push(build(g, { freq: "WEEKLY", interval: step / 7, until: (days[days.length - 1] as Item).day, tz, skip }, taken));
  }

  // Every day and every month: no holes allowed, the rhythm must be exact.
  const rest = items.filter((i) => !taken.has(i.row.id));
  for (const g of group(base, rest)) {
    const days = perDay(g);
    if (days.length < MIN) continue;
    const gaps = days.slice(1).map((d, k) => dayNumber(d.day) - dayNumber((days[k] as Item).day));
    const lastDay = days[days.length - 1] as Item;
    if (gaps.every((x) => x === 1)) out.push(build(g, { freq: "DAILY", interval: 1, until: lastDay.day, tz, skip: [] }, taken));
    else if (gaps.every((x) => x >= 28 && x <= 31) && days.every((d) => d.day.slice(8) === (days[0] as Item).day.slice(8))) out.push(build(g, { freq: "MONTHLY", interval: 1, until: lastDay.day, tz, skip: [] }, taken));
  }
  return out.sort((a, b) => a.first.localeCompare(b.first) || a.title.localeCompare(b.title));
}
