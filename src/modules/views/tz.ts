/**
 * Time zones for the calendar. Everything stored stays UTC; a person's zone only decides which day and hour an instant is
 * drawn on, and how the hour they type in the new-meeting form turns back into an instant. Pure, built on Intl, no tables.
 */

const formats = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formats.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

interface Wall {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
}

function wall(at: Date, tz: string): Wall {
  const v: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(at)) if (p.type !== "literal") v[p.type] = Number(p.value);
  return { y: v.year as number, mo: v.month as number, d: v.day as number, h: (v.hour as number) % 24, mi: v.minute as number, s: v.second as number };
}

/** The calendar day (`YYYY-MM-DD`), clock (`HH:MM`) and minutes since midnight that an instant has in a zone. */
export function zonedParts(at: Date | string | number, tz: string): { day: string; time: string; minutes: number } {
  const w = wall(new Date(at), tz);
  return { day: `${w.y}-${pad(w.mo)}-${pad(w.d)}`, time: `${pad(w.h)}:${pad(w.mi)}`, minutes: w.h * 60 + w.mi };
}

/** Minutes the zone's clock is ahead of UTC at that instant (Paris in winter: 60, in summer: 120). */
export function offsetMinutes(at: Date, tz: string): number {
  const w = wall(at, tz);
  const asIfUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  return Math.round((asIfUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** The instant at which the wall clock of `tz` shows `day` and `time`. A time that does not exist (clocks jumped forward) lands just after the jump. */
export function zonedToUtc(day: string, time: string, tz: string): Date {
  const [y, mo, d] = day.split("-").map(Number) as [number, number, number];
  const [h, mi] = time.split(":").map(Number) as [number, number];
  const target = Date.UTC(y, mo - 1, d, h, mi);
  let guess = target - offsetMinutes(new Date(target), tz) * 60_000;
  guess = target - offsetMinutes(new Date(guess), tz) * 60_000;
  return new Date(guess);
}

/** Today's date in a zone. */
export const todayIn = (tz: string, now: Date = new Date()): string => zonedParts(now, tz).day;

/** "UTC", "UTC+01:00", "UTC−05:00", "UTC+05:30". */
export function offsetLabel(tz: string, at: Date = new Date()): string {
  const m = offsetMinutes(at, tz);
  if (m === 0) return "UTC";
  const a = Math.abs(m);
  return `UTC${m < 0 ? "−" : "+"}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** "Europe/Paris (UTC+01:00)", or just "UTC". */
export const zoneLabel = (tz: string, at: Date = new Date()): string => (tz === "UTC" ? "UTC" : `${tz.replace(/_/g, " ")} (${offsetLabel(tz, at)})`);

const FALLBACK = ["UTC", "Europe/London", "Europe/Paris", "Europe/Warsaw", "Europe/Kyiv", "Europe/Moscow", "Asia/Tbilisi", "Asia/Dubai", "Asia/Kolkata", "Asia/Bangkok", "Asia/Tokyo", "Australia/Sydney", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Sao_Paulo"];

/** Every zone the browser knows, UTC first. */
export function listTimeZones(): string[] {
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : FALLBACK;
  return ["UTC", ...all.filter((z) => z !== "UTC")];
}

/** The browser's own zone, or UTC when it will not say. */
export function browserTimeZone(): string {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return z && isValidTimeZone(z) ? z : "UTC";
  } catch {
    return "UTC";
  }
}
