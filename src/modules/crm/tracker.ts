import { todayIn, zonedToUtc } from "@/modules/views/tz";

/** What the week is counted in: people added, people reached, presentations made, clients and partners won, calls and meetings held. */
export const METRICS = ["added", "contacted", "presentations", "clients", "partners", "meetings"] as const;
export type Metric = (typeof METRICS)[number];
export type Goals = Partial<Record<Metric, number>>;
export type Counts = Record<Metric, number>;

/** The funnel stage whose arrival counts toward a metric. */
export const METRIC_STAGE: Partial<Record<Metric, string>> = { contacted: "FIRST_CONTACT", presentations: "PRESENTATION", clients: "CLIENT", partners: "PARTNER" };

export const emptyCounts = (): Counts => ({ added: 0, contacted: 0, presentations: 0, clients: 0, partners: 0, meetings: 0 });

export const addDays = (day: string, n: number): string => new Date(new Date(`${day}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** The week (Monday to Sunday) in a person's time zone, as instants: `offset` 0 is this week, -1 the one before. */
export function weekBounds(tz: string, now: Date, offset = 0): { start: Date; end: Date; from: string; to: string } {
  const today = todayIn(tz, now);
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const monday = addDays(today, -((dow + 6) % 7) + offset * 7);
  const next = addDays(monday, 7);
  return { start: zonedToUtc(monday, "00:00", tz), end: zonedToUtc(next, "00:00", tz), from: monday, to: addDays(monday, 6) };
}

/** Goals as stored: only known metrics with whole numbers from 0 to 9999. */
export function cleanGoals(raw: unknown): Goals {
  const out: Goals = {};
  if (!raw || typeof raw !== "object") return out;
  for (const m of METRICS) {
    const v = (raw as Record<string, unknown>)[m];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[m] = Math.min(9999, Math.round(v));
  }
  return out;
}

/** How far along a goal is, 0 to 100; null when there is no goal to measure against. */
export function progress(count: number, goal: number | undefined): number | null {
  if (!goal || goal <= 0) return null;
  return Math.min(100, Math.round((count / goal) * 100));
}

/** The date a next step falls on `afterDays` from today, in the form the card keeps it (a day at midnight UTC). */
export const stepDate = (today: string, afterDays: number): string => `${addDays(today, Math.max(0, afterDays))}T00:00:00.000Z`;

/** A script with the person's name in it: {name} is the first name, {full_name} the whole name, {my_name} yours. */
export function fillScript(body: string, v: { name: string; fullName: string; myName: string }): string {
  return body.replace(/\{(name|full_name|my_name)\}/g, (_, k: string) => (k === "name" ? v.name : k === "full_name" ? v.fullName : v.myName));
}
