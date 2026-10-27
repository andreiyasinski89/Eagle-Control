import { zonedParts, zonedToUtc } from "./tz";

/** Everything the "new meeting" form needs that is not drawing: defaults from where the user clicked, and the event's data payload. Hours the person sees and types are in their own time zone; what is stored is UTC. */

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const minutesOf = (hhmm: string) => {
  const m = CLOCK.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Start and end for a new meeting: from the clicked time, or the next full hour in the person's zone; one hour long, never past midnight. */
export function defaultTimes(clicked: string | undefined, now: Date, tz = "UTC"): { start: string; end: string } {
  const from = clicked !== undefined ? minutesOf(clicked) : null;
  const hour = Math.floor(zonedParts(now, tz).minutes / 60);
  const start = Math.min(from ?? Math.min((hour + 1) * 60, 22 * 60), 23 * 60);
  const end = Math.min(start + 60, 23 * 60 + 59);
  return { start: clock(start), end: clock(end) };
}

export interface EventForm {
  title: string;
  /** YYYY-MM-DD */
  day: string;
  allDay: boolean;
  /** HH:MM */
  start: string;
  end: string;
  location: string;
  meetingUrl: string;
  agenda: string;
  addMeet: boolean;
  /** The creator is the attendee, otherwise the event would not show under "only mine". */
  attendeeId: string | null;
}

export type EventProblem = "title" | "day" | "time" | "url";

export type EventData = {
  startsAt: string;
  endsAt?: string;
  attendeeIds: string[];
  agenda: string;
  meetingUrl?: string;
  addMeet?: boolean;
  location?: string;
};

function isUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** The title and `data` for POST /api/v1/nodes, or what is wrong with the form. `day` and the times are in `tz`; an all-day meeting is a date, not an instant, and ignores it. */
export function buildEvent(f: EventForm, tz = "UTC"): { ok: true; title: string; data: EventData } | { ok: false; problem: EventProblem } {
  const title = f.title.trim();
  if (!title) return { ok: false, problem: "title" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.day) || Number.isNaN(Date.parse(`${f.day}T00:00:00Z`))) return { ok: false, problem: "day" };
  const url = f.meetingUrl.trim();
  if (url && !isUrl(url)) return { ok: false, problem: "url" };

  const data: EventData = { startsAt: `${f.day}T00:00:00.000Z`, attendeeIds: f.attendeeId ? [f.attendeeId] : [], agenda: f.agenda.trim() };
  if (!f.allDay) {
    const s = minutesOf(f.start);
    const e = minutesOf(f.end);
    if (s === null || e === null || e <= s) return { ok: false, problem: "time" };
    data.startsAt = zonedToUtc(f.day, f.start, tz).toISOString();
    data.endsAt = zonedToUtc(f.day, f.end, tz).toISOString();
  }
  if (url) data.meetingUrl = url;
  else if (f.addMeet) data.addMeet = true;
  if (f.location.trim()) data.location = f.location.trim().slice(0, 300);
  return { ok: true, title, data };
}
