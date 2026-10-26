// ── the hourly time grid (day and week views) ──────────────────────────────

/** Height of one hour on screen, in pixels. */
export const HOUR_PX = 48;
export const DAY_MINUTES = 1440;
/** An event without an end lasts this long on the grid; nothing is drawn shorter than the minimum so it stays clickable. */
export const DEFAULT_MINUTES = 60;
export const MIN_MINUTES = 30;

/** "09:30" → 570; "24:00" is allowed as the end of the day. Anything else is not a time of day. */
export function parseClock(s: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && minutes <= DAY_MINUTES ? minutes : null;
}

export const minutesToPx = (minutes: number): number => (minutes / 60) * HOUR_PX;

export interface Placed {
  id: string;
  start: number;
  end: number;
  /** Column among the events that overlap in time, and how many columns that group needs. */
  col: number;
  cols: number;
}

/**
 * Places one day's timed events like Google Calendar: events that overlap share the width side by side,
 * and a group of overlapping events is as wide as its busiest moment needs, no wider.
 */
export function layoutDay(items: readonly { id: string; start: number; end?: number | null }[]): Placed[] {
  const norm = items
    .map((i) => {
      const start = Math.min(Math.max(i.start, 0), DAY_MINUTES - MIN_MINUTES);
      const end = Math.min(DAY_MINUTES, Math.max(i.end ?? start + DEFAULT_MINUTES, start + MIN_MINUTES));
      return { id: i.id, start, end };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));

  const out: Placed[] = [];
  let group: { id: string; start: number; end: number; col: number }[] = [];
  let colEnds: number[] = [];
  let groupEnd = -1;
  const flush = () => {
    for (const p of group) out.push({ ...p, cols: colEnds.length });
    group = [];
    colEnds = [];
    groupEnd = -1;
  };
  for (const it of norm) {
    if (group.length && it.start >= groupEnd) flush();
    let col = colEnds.findIndex((e) => e <= it.start);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(it.end);
    } else colEnds[col] = it.end;
    group.push({ ...it, col });
    groupEnd = Math.max(groupEnd, it.end);
  }
  flush();
  return out;
}

/** Items with a time of day go on the hour grid; the rest (deadlines, all-day entries) go in the strip above it. */
export function splitTimed<T extends { time?: string }>(items: readonly T[]): { allDay: T[]; timed: T[] } {
  const allDay: T[] = [];
  const timed: T[] = [];
  for (const i of items) (parseClock(i.time) === null ? allDay : timed).push(i);
  return { allDay, timed };
}

/** The minute of the day the grid should scroll to when it opens: an hour before the first event, else now, else 08:00. */
export function initialFocus(starts: readonly number[], nowMinute: number | null): number {
  const focus = starts.length ? Math.min(...starts) : (nowMinute ?? 8 * 60);
  return Math.max(0, focus - 60);
}
