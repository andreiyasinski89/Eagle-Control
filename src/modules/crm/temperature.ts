import type { Stage } from "./people";

/**
 * How warm a person is, worked out from what happened with them, so nobody has to fill it in by hand.
 *
 * Points, added up:
 * - the stage of the funnel: 0 for a new name up to 4 for someone who is deciding;
 * - touches done in the last 30 days: half a point each (up to 2): the person is being worked with;
 * - replies in the last 30 days: 2 each (up to 4); an agreed meeting: 3;
 * - a meeting or a presentation held in the last 60 days: 3;
 * - a question about the price or the terms in the last 14 days: 3;
 * - a move forward in the funnel in the last 14 days: 1;
 * - silence: the days since the last contact take away 1 (4–7 days), 2 (8–14), 3 (15–30) or 4 (more); not for someone not yet written to;
 * - messages left without an answer: 2 in a row take away 1, 3 or more in a row take away 3.
 * 6 points or more is hot, 3 or more is warm, the rest is cold. Those who said no or do not answer are cold; clients and partners have no temperature.
 * Only what is known counts: a reply, a meeting set and a price question come from the result of a touch, so before those are recorded
 * the number rests on the stage, the touches, the meetings held and the silence.
 */
export type Temperature = "HOT" | "WARM" | "COLD";
export type ActivityKind = "CALL" | "EMAIL" | "MEETING" | "MESSAGE" | "NOTE" | "TASK";
export type Outcome = "REPLIED" | "NO_REPLY" | "MEETING_SET" | "DECLINED";
/** Marks left on a touch by whoever made it. */
export const SIGNALS = ["PRICE_QUESTION"] as const;
export type Signal = (typeof SIGNALS)[number];

export interface TempContact {
  stage: Stage;
  createdAt: Date;
  lastContactedAt: Date | null;
  stageChangedAt: Date | null;
  /** The stage the person was in before the last move; null when they were added into the stage they are in. A move forward counts as a point. */
  previousStage?: Stage | null;
}

export interface TempActivity {
  type: ActivityKind;
  /** When it was done; null while it is only planned. */
  completedAt: Date | null;
  outcome?: Outcome | string | null;
  signals?: readonly string[] | null;
}

export interface TempResult {
  /** null where a temperature makes no sense (a client, a partner). */
  temperature: Temperature | null;
  score: number;
  /** What counted, in words for a person to read, most important first. */
  reasons: string[];
}

export const HOT_FROM = 6;
export const WARM_FROM = 3;
/** A temperature set by hand holds this long before the computed one takes over again. */
export const MANUAL_HOLD_DAYS = 14;

const DAY = 86_400_000;
const STAGE_POINTS: Partial<Record<Stage, number>> = { NEW: 0, FIRST_CONTACT: 1, WARMING: 2, PRESENTATION: 3, DECIDING: 4 };
const ORDER: Stage[] = ["NEW", "FIRST_CONTACT", "WARMING", "PRESENTATION", "DECIDING", "CLIENT", "PARTNER"];
const TOUCHES: ActivityKind[] = ["CALL", "EMAIL", "MEETING", "MESSAGE"];
const daysAgo = (d: Date, now: Date) => (now.getTime() - d.getTime()) / DAY;

export function temperatureOf(score: number): Temperature {
  return score >= HOT_FROM ? "HOT" : score >= WARM_FROM ? "WARM" : "COLD";
}

export function computeTemperature(c: TempContact, activities: readonly TempActivity[], now: Date = new Date()): TempResult {
  if (c.stage === "CLIENT" || c.stage === "PARTNER") return { temperature: null, score: 0, reasons: [] };
  if (c.stage === "DECLINED" || c.stage === "NO_REPLY") return { temperature: "COLD", score: 0, reasons: [c.stage === "DECLINED" ? "declined" : "no_reply"] };

  const reasons: { text: string; points: number }[] = [];
  const add = (text: string, points: number) => {
    if (points !== 0) reasons.push({ text, points });
  };
  add(`stage:${c.stage}`, STAGE_POINTS[c.stage] ?? 0);

  const done = activities.filter((a) => a.completedAt && a.completedAt <= now).sort((a, b) => (b.completedAt as Date).getTime() - (a.completedAt as Date).getTime());
  const touches = done.filter((a) => TOUCHES.includes(a.type));
  const recent = touches.filter((a) => daysAgo(a.completedAt as Date, now) <= 30);
  add("touches", Math.min(2, recent.length * 0.5));

  const replies = recent.filter((a) => a.outcome === "REPLIED").length;
  add("replies", Math.min(4, replies * 2));
  if (touches.some((a) => a.outcome === "MEETING_SET" && daysAgo(a.completedAt as Date, now) <= 30)) add("meeting_set", 3);
  if (touches.some((a) => a.type === "MEETING" && daysAgo(a.completedAt as Date, now) <= 60)) add("meeting_held", 3);
  if (done.some((a) => a.signals?.includes("PRICE_QUESTION") && daysAgo(a.completedAt as Date, now) <= 14)) add("price_question", 3);

  // Only a real move counts: a person added straight into a stage was not "moved" there.
  const moved = c.previousStage ? ORDER.indexOf(c.stage) > ORDER.indexOf(c.previousStage) : false;
  if (c.stageChangedAt && daysAgo(c.stageChangedAt, now) <= 14 && moved) add("moved_forward", 1);

  // Messages that got no answer, newest first: how many in a row.
  let unanswered = 0;
  for (const a of touches) {
    if (a.outcome === "NO_REPLY") unanswered++;
    else break;
  }
  add("unanswered", unanswered >= 3 ? -3 : unanswered === 2 ? -1 : 0);

  const last = [c.lastContactedAt, touches[0]?.completedAt ?? null].filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  if (last) {
    const silent = daysAgo(last, now);
    add("silence", silent <= 3 ? 0 : silent <= 7 ? -1 : silent <= 14 ? -2 : silent <= 30 ? -3 : -4);
  }

  const score = reasons.reduce((sum, r) => sum + r.points, 0);
  return { temperature: temperatureOf(score), score, reasons: reasons.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).map((r) => r.text) };
}

/** Whether a temperature set by hand still holds. */
export function manualHolds(manualUntil: Date | null | undefined, now: Date = new Date()): boolean {
  return !!manualUntil && manualUntil.getTime() > now.getTime();
}

export const manualUntil = (now: Date = new Date()): Date => new Date(now.getTime() + MANUAL_HOLD_DAYS * DAY);
