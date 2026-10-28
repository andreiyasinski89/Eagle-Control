import { z } from "zod";
import { zonedParts, zonedToUtc } from "@/modules/views/tz";

/**
 * A repeating event is one node that carries its rule, not a node per date. The rule is simple on purpose: every N days, weeks or months,
 * on the day and hour of the first date, until a last day (or for ever). It runs on the wall clock of `tz`, so a 19:00 meeting stays at
 * 19:00 when the clocks change. `skip` lists dates that are left out ("not this week").
 */
export const FREQS = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type Freq = (typeof FREQS)[number];

export const repeatSchema = z.object({
  freq: z.enum(FREQS),
  interval: z.number().int().min(1).max(12).default(1),
  /** Last day of the series, inclusive, as a date in `tz`. Without it the series has no end. */
  until: z.string().date().optional(),
  tz: z.string().min(1).max(64).default("UTC"),
  skip: z.array(z.string().date()).max(366).default([]),
});
export type Repeat = z.infer<typeof repeatSchema>;

export interface RepeatingEvent {
  startsAt?: string;
  endsAt?: string;
  repeat?: Repeat;
}

export interface Occurrence {
  /** The date it falls on, `YYYY-MM-DD` in the rule's zone. */
  day: string;
  start: Date;
  end: Date | null;
  /** 0 is the first date of the series. */
  index: number;
}

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const dayNumber = (day: string): number => Date.parse(`${day}T00:00:00Z`) / DAY;
const dayString = (n: number): string => new Date(n * DAY).toISOString().slice(0, 10);

/** The `n`-th date of the series, counted from its first day. Monthly dates that a month does not have ("31st") fall on its last day. */
function nthDay(first: string, r: Repeat, n: number): string {
  if (r.freq === "DAILY") return dayString(dayNumber(first) + n * r.interval);
  if (r.freq === "WEEKLY") return dayString(dayNumber(first) + 7 * n * r.interval);
  const [y, m, d] = first.split("-").map(Number) as [number, number, number];
  const months = m - 1 + n * r.interval;
  const year = y + Math.floor(months / 12);
  const month = ((months % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(d, last))}`;
}

/** The dates of a series that start in `[from, to)`, in order. `max` guards against a rule that runs for ever over a wide window. */
export function occurrences(ev: RepeatingEvent, from: Date, to: Date, max = 500): Occurrence[] {
  if (!ev.startsAt) return [];
  const first = new Date(ev.startsAt);
  if (Number.isNaN(first.getTime())) return [];
  const length = ev.endsAt ? new Date(ev.endsAt).getTime() - first.getTime() : null;
  const r = ev.repeat;
  const one = (start: Date, day: string, index: number): Occurrence => ({ day, start, end: length !== null && length >= 0 ? new Date(start.getTime() + length) : null, index });
  if (!r) return first >= from && first < to ? [one(first, zonedParts(first, "UTC").day, 0)] : [];

  const { day: firstDay, time } = zonedParts(first, r.tz);
  const skip = new Set(r.skip);
  const out: Occurrence[] = [];
  // Jump close to the window instead of walking from the first date.
  let n = 0;
  const fromDay = zonedParts(from, r.tz).day;
  if (fromDay > firstDay) {
    if (r.freq === "MONTHLY") {
      const months = (Number(fromDay.slice(0, 4)) - Number(firstDay.slice(0, 4))) * 12 + Number(fromDay.slice(5, 7)) - Number(firstDay.slice(5, 7));
      n = Math.max(0, Math.floor(months / r.interval) - 1);
    } else {
      const step = (r.freq === "DAILY" ? 1 : 7) * r.interval;
      n = Math.max(0, Math.floor((dayNumber(fromDay) - dayNumber(firstDay)) / step) - 1);
    }
  }
  for (let guard = 0; guard < 5000 && out.length < max; guard++, n++) {
    const day = nthDay(firstDay, r, n);
    if (r.until && day > r.until) break;
    const start = n === 0 ? first : zonedToUtc(day, time, r.tz);
    if (start >= to) break;
    if (start < from || skip.has(day)) continue;
    out.push(one(start, day, n));
  }
  return out;
}

/** The next date at or after `now` (an occurrence in progress counts), and how many more follow it; `more` is null for a series without an end. */
export function nextOccurrence(ev: RepeatingEvent, now: Date): { next: Occurrence | null; more: number | null } {
  const r = ev.repeat;
  if (!r || !ev.startsAt) return { next: null, more: null };
  const horizon = new Date(now.getTime() + 3 * 366 * DAY);
  const upcoming = occurrences(ev, new Date(now.getTime() - (ev.endsAt ? Math.max(0, new Date(ev.endsAt).getTime() - new Date(ev.startsAt).getTime()) : 0)), horizon, 400);
  const next = upcoming[0] ?? null;
  return { next, more: r.until ? Math.max(0, upcoming.length - 1) : null };
}

/** "Every week", "Every 2 weeks": the pieces the screen turns into words. */
export function repeatKey(r: Repeat): { freq: Freq; interval: number } {
  return { freq: r.freq, interval: r.interval };
}

/** The value of a Google Calendar RRULE for the rule (`RRULE:` is added by the caller). `until` is the end of that day in the rule's zone. */
export function toRrule(r: Repeat): string {
  const parts = [`FREQ=${r.freq}`];
  if (r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.until) parts.push(`UNTIL=${zonedToUtc(r.until, "23:59", r.tz).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`);
  return parts.join(";");
}

/** Dates of the series that Google must leave out (`EXDATE`), as local date-times in the rule's zone, for the event's time of day. */
export function exdates(ev: RepeatingEvent): string[] {
  const r = ev.repeat;
  if (!r || !ev.startsAt) return [];
  const { time } = zonedParts(new Date(ev.startsAt), r.tz);
  return r.skip.map((d) => `${d.replace(/-/g, "")}T${time.replace(":", "")}00`);
}

/** The choices the screens offer. A rule made elsewhere (every 3 weeks) is "CUSTOM": shown as it is and kept when the event is saved. */
export const PRESETS = ["NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"] as const;
export type Preset = (typeof PRESETS)[number];

export function presetOf(r: Repeat | null | undefined): Preset | "CUSTOM" {
  if (!r) return "NONE";
  if (r.freq === "DAILY" && r.interval === 1) return "DAILY";
  if (r.freq === "WEEKLY" && r.interval === 1) return "WEEKLY";
  if (r.freq === "WEEKLY" && r.interval === 2) return "BIWEEKLY";
  if (r.freq === "MONTHLY" && r.interval === 1) return "MONTHLY";
  return "CUSTOM";
}

/** The rule for a choice; `until` and `skip` of an existing rule are carried over when the person only changes the frequency. */
export function ruleFromPreset(p: Preset, tz: string, keep?: Pick<Repeat, "until" | "skip">): Repeat | null {
  const base = { tz, until: keep?.until, skip: keep?.skip ?? [] };
  switch (p) {
    case "DAILY":
      return { freq: "DAILY", interval: 1, ...base };
    case "WEEKLY":
      return { freq: "WEEKLY", interval: 1, ...base };
    case "BIWEEKLY":
      return { freq: "WEEKLY", interval: 2, ...base };
    case "MONTHLY":
      return { freq: "MONTHLY", interval: 1, ...base };
    default:
      return null;
  }
}

/** What a map card needs to know about an event: when it starts, how long, and the rule. */
export interface EventSummary {
  startsAt: string;
  endsAt?: string;
  repeat?: Repeat;
}

export function eventSummary(data: unknown): EventSummary | undefined {
  const d = (data ?? {}) as { startsAt?: unknown; endsAt?: unknown; repeat?: unknown };
  if (typeof d.startsAt !== "string") return undefined;
  const rule = repeatSchema.safeParse(d.repeat);
  return { startsAt: d.startsAt, ...(typeof d.endsAt === "string" ? { endsAt: d.endsAt } : {}), ...(rule.success ? { repeat: rule.data } : {}) };
}
