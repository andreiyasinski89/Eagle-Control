import { zonedParts } from "./tz";

export interface CalendarApiItem {
  kind: "task" | "milestone" | "event" | "crm_activity" | "deal_step" | "deal_close";
  /** ISO instant; a date-only item is midnight UTC. */
  at: string;
  endAt: string | null;
}

export interface Placement {
  /** Day key, YYYY-MM-DD, in the person's zone for timed items. */
  day: string;
  /** Start HH:MM in the person's zone; absent for an all-day item. */
  time?: string;
  /** End HH:MM on the same day, "24:00" when it runs past midnight. */
  endTime?: string;
}

/**
 * Where an item of the workspace calendar sits for someone in `tz`.
 * Deadlines, milestones and deal dates are dates, not instants: they stay on their own day whatever the zone.
 * Events and CRM activities are instants and move with the zone; one at exactly midnight UTC with no end is the "all day" convention.
 * An event or a scheduled call or meeting with a length is drawn as a block from its start to its end.
 */
export function placeItem(i: CalendarApiItem, tz: string): Placement {
  const instant = i.kind === "event" || i.kind === "crm_activity";
  const allDay = !instant || (!i.endAt && i.at.slice(11, 19) === "00:00:00");
  if (allDay) return { day: i.at.slice(0, 10) };
  const start = zonedParts(i.at, tz);
  if (!i.endAt) return { day: start.day, time: start.time };
  const end = zonedParts(i.endAt, tz);
  return { day: start.day, time: start.time, endTime: end.day === start.day ? end.time : "24:00" };
}
