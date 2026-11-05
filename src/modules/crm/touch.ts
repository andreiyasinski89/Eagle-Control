import { addDays } from "./tracker";
import type { Stage } from "./people";
import type { Temperature } from "./temperature";

/**
 * The touch queue: the people to write to today, one at a time, and what each answer does to the next step.
 * Everything here is plain functions: the order of the queue, the next step after a result, the situation a script is for.
 */
export const OUTCOMES = ["REPLIED", "NO_REPLY", "MEETING_SET", "DECLINED", "WAITING"] as const;
export type TouchOutcome = (typeof OUTCOMES)[number];

/** The moments a script is written for. */
export const SITUATIONS = ["FIRST_TOUCH", "REMINDER", "AFTER_PRESENTATION", "RETURN"] as const;
export type Situation = (typeof SITUATIONS)[number];

/** The two buttons that set the next touch: "write again in 7 days" and "in 14 days". Nothing else puts a person back into the list by itself. */
export const NEXT_IN_DAYS = [7, 14] as const;
export type NextInDays = (typeof NEXT_IN_DAYS)[number];

/** After how many days without a touch (and with no date set) the person gets a reminder from the bot. */
export const STALE_DAY_CHOICES = [7, 14, 21, 30] as const;

export interface TouchSettings {
  /** A person with no date set and no touch for this many days is reminded of by the bot (7 to 60). */
  staleDays: number;
  /** This many unanswered touches in a row and the person goes quiet. */
  coolAfter: number;
  /** A quiet person is written to again after this many days. */
  coolDays: number;
  /** After a no: days until the person is written to again (60 to 90). */
  declineDays: number;
  /** A meeting that is set moves the person on to the presentation stage. */
  meetingMovesStage: boolean;
}

export const DEFAULT_TOUCH_SETTINGS: TouchSettings = { staleDays: 14, coolAfter: 3, coolDays: 30, declineDays: 75, meetingMovesStage: true };

const clamp = (v: unknown, min: number, max: number, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);

/** Settings as stored: anything missing or out of range falls back to the default or the nearest allowed value. */
export function cleanTouchSettings(raw: unknown): TouchSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_TOUCH_SETTINGS;
  return {
    staleDays: clamp(r.staleDays, 7, 60, d.staleDays),
    coolAfter: d.coolAfter,
    coolDays: d.coolDays,
    declineDays: clamp(r.declineDays, 60, 90, d.declineDays),
    meetingMovesStage: typeof r.meetingMovesStage === "boolean" ? r.meetingMovesStage : d.meetingMovesStage,
  };
}

// ── The order of the queue ─────────────────────────────────────────

export interface QueueItem {
  id: string;
  name: string;
  stage: Stage;
  temperature: Temperature | null;
  /** The day the next step falls on (YYYY-MM-DD); null for none. */
  day: string | null;
  overdue: boolean;
}

const TEMP_RANK: Record<string, number> = { HOT: 0, WARM: 1, COLD: 2 };
const STAGE_RANK: Partial<Record<Stage, number>> = { DECIDING: 0, PRESENTATION: 1, WARMING: 2, FIRST_CONTACT: 3, NEW: 4 };

/** Late ones first, then the hottest, then those closest to a decision, then the oldest date, then by name. */
export function orderQueue<T extends QueueItem>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      (TEMP_RANK[a.temperature ?? ""] ?? 3) - (TEMP_RANK[b.temperature ?? ""] ?? 3) ||
      (STAGE_RANK[a.stage] ?? 5) - (STAGE_RANK[b.stage] ?? 5) ||
      (a.day ?? "9999").localeCompare(b.day ?? "9999") ||
      a.name.localeCompare(b.name),
  );
}

/** What to say to this person now: a first touch to a new name, a reminder after silence, words after a presentation, a return to a quiet one. */
export function situationFor(c: { stage: Stage; lastOutcome: string | null; meetingHeld: boolean }): Situation {
  if (c.stage === "DECLINED" || c.stage === "NO_REPLY") return "RETURN";
  if (c.lastOutcome === "NO_REPLY" || c.lastOutcome === "WAITING") return "REMINDER";
  if (c.stage === "PRESENTATION" || c.stage === "DECIDING" || c.meetingHeld) return "AFTER_PRESENTATION";
  return c.stage === "NEW" ? "FIRST_TOUCH" : "REMINDER";
}

// ── What a result does ─────────────────────────────────────────────

type Lang = "ru" | "en" | "pl" | "uk";
const lang = (l: string | null | undefined): Lang => (l === "ru" || l === "pl" || l === "uk" ? l : "en");

/** The next steps the queue writes, in the person's language: what to do, not "write a message". */
const TEXT: Record<Lang, { again: string; cooled: string; meeting: (date: string) => string; declined: string }> = {
  ru: { again: "Написать снова", cooled: "Вернуться к человеку после паузы", meeting: (d) => `Встреча ${d}: провести разговор`, declined: "Вернуться к разговору, если что-то изменилось" },
  en: { again: "Write again", cooled: "Come back to them after the pause", meeting: (d) => `Meeting on ${d}: have the talk`, declined: "Come back to the conversation if something has changed" },
  pl: { again: "Napisać ponownie", cooled: "Wrócić do osoby po przerwie", meeting: (d) => `Spotkanie ${d}: przeprowadzić rozmowę`, declined: "Wrócić do rozmowy, jeśli coś się zmieniło" },
  uk: { again: "Написати знову", cooled: "Повернутися до людини після паузи", meeting: (d) => `Зустріч ${d}: провести розмову`, declined: "Повернутися до розмови, якщо щось змінилося" },
};

export interface TouchPlan {
  /** The stage to move to, when it changes. */
  stage?: Stage;
  /** What to do next; null when no date is set (the person is not put back into the list: the bot reminds when the silence gets long). */
  nextStep: string | null;
  /** The day of the next step (YYYY-MM-DD); null for none. */
  day: string | null;
  /** Set for someone who is out of the queue until then (said no, or went quiet). */
  returnAt?: string;
  /** The person went quiet after too many touches without an answer. */
  cooled: boolean;
}

export interface PlanInput {
  outcome: TouchOutcome;
  stage: Stage;
  /** Today in the person's own zone (YYYY-MM-DD). */
  today: string;
  settings: TouchSettings;
  /** How many touches in a row went unanswered, this one included (for NO_REPLY). */
  unansweredInRow?: number;
  /** The person pressed "write again in 7 / 14 days". */
  nextInDays?: number;
  /** The day of the meeting that was set (YYYY-MM-DD), for MEETING_SET. */
  meetingDay?: string;
  locale?: string | null;
}

const ORDER: Stage[] = ["NEW", "FIRST_CONTACT", "WARMING", "PRESENTATION", "DECIDING", "CLIENT", "PARTNER"];
const before = (a: Stage, b: Stage) => ORDER.indexOf(a) !== -1 && ORDER.indexOf(a) < ORDER.indexOf(b);
const shortDate = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

/**
 * The stage, the next step and its day after a touch, by the person's own settings.
 * A touch no longer puts the person back into the list by itself, whatever came of it: only the person's own press of "write again in 7 / 14 days"
 * does. Without it there is no date, and the bot reminds when the silence has lasted long enough. A meeting that is set keeps its day, a no keeps its long wait.
 */
export function planTouch(p: PlanInput): TouchPlan {
  const t = TEXT[lang(p.locale)];
  const s = p.settings;
  // Writing to a name for the first time makes it a first contact, whatever the answer.
  const opened: Stage | undefined = p.stage === "NEW" ? "FIRST_CONTACT" : undefined;
  // Someone who was out of the queue and answers is back in the funnel.
  const revived: Stage | undefined = p.stage === "DECLINED" || p.stage === "NO_REPLY" ? "FIRST_CONTACT" : undefined;
  const quiet = p.stage === "DECLINED" || p.stage === "NO_REPLY";
  const chosen = p.nextInDays && p.nextInDays > 0 ? p.nextInDays : null;

  /** Without a press: no date for a person in the funnel; a person who rests keeps resting, with a day to come back (the pause), not a day in the list. */
  const dateless = (stage: Stage | undefined, resting: boolean): TouchPlan => {
    if (chosen) {
      const day = addDays(p.today, chosen);
      return { stage, nextStep: t.again, day, ...(resting ? { returnAt: day } : {}), cooled: false };
    }
    if (resting) {
      const day = addDays(p.today, s.coolDays);
      return { stage, nextStep: t.cooled, day, returnAt: day, cooled: false };
    }
    return { stage, nextStep: null, day: null, cooled: false };
  };

  switch (p.outcome) {
    case "REPLIED":
      return dateless(revived ?? opened, false);
    case "WAITING":
      return dateless(opened, quiet);
    case "NO_REPLY": {
      if ((p.unansweredInRow ?? 1) >= s.coolAfter) {
        const day = addDays(p.today, s.coolDays);
        return { stage: "NO_REPLY", nextStep: t.cooled, day, returnAt: day, cooled: true };
      }
      return dateless(revived ?? opened, quiet);
    }
    case "MEETING_SET": {
      const day = p.meetingDay ?? addDays(p.today, 1);
      const advance = s.meetingMovesStage && (before(p.stage, "PRESENTATION") || p.stage === "DECLINED" || p.stage === "NO_REPLY") ? ("PRESENTATION" as Stage) : (revived ?? opened);
      return { stage: advance, nextStep: t.meeting(shortDate(day)), day, cooled: false };
    }
    case "DECLINED": {
      const day = addDays(p.today, s.declineDays);
      return { stage: "DECLINED", nextStep: t.declined, day, returnAt: day, cooled: false };
    }
  }
}
