import type { Stage } from "./people";

/**
 * How long a contact may stay without a touch before the agent speaks up, by stage.
 * Starting values from the agent plan; tune them by what actually happens.
 */
export const SILENCE_NORMS = {
  /** A person wrote back and we have not answered. */
  repliedHours: 24,
  /** The reminder before a booked presentation. */
  meetingLeadHours: 2,
  stageDays: { DECIDING: 2, WARMING: 4, NO_REPLY: 7, DECLINED: 45 } as Partial<Record<Stage, number>>,
} as const;

export type SilenceKind = "replied" | "meeting_soon" | "deciding" | "warming" | "no_reply" | "declined";

/** What the agent should do about it; shown in the follow-up table. */
export const SILENCE_ACTION: Record<SilenceKind, string> = {
  replied: "красный флаг: человек ответил, ответь первым",
  meeting_soon: "напомнить и подтвердить встречу",
  deciding: "мягкий дожим с новым поводом",
  warming: "повторное касание с поводом",
  no_reply: "последняя попытка, потом DECLINED",
  declined: "вернуть в повторное касание",
};

/** Lower = more urgent. Replied people go first, as in the morning briefing. */
const PRIORITY: Record<SilenceKind, number> = { replied: 0, meeting_soon: 1, deciding: 2, warming: 3, no_reply: 4, declined: 5 };
const KIND_OF_STAGE: Partial<Record<Stage, SilenceKind>> = { DECIDING: "deciding", WARMING: "warming", NO_REPLY: "no_reply", DECLINED: "declined" };

const HOUR = 3_600_000;

export interface SilenceInput {
  stage: Stage;
  temperature: "HOT" | "WARM" | "COLD" | null;
  lastContactedAt: Date | null;
  stageChangedAt: Date;
  repliedAt: Date | null;
  /** Start of the next open MEETING with this person, if one is booked. */
  nextMeetingAt: Date | null;
}

export interface SilenceHit {
  kind: SilenceKind;
  /** Since when the clock runs (the reply, the last touch, or the stage change if never touched). */
  since: Date;
  silentHours: number;
  /** Hours past the norm; for meeting_soon, minutes to the meeting are in `silentHours` as 0 and this is 0. */
  overdueHours: number;
}

/** The one timer that fires for a contact right now, or null. A reply outranks the stage timer. */
export function evaluateSilence(c: SilenceInput, now: Date): SilenceHit | null {
  if (c.repliedAt && (!c.lastContactedAt || c.lastContactedAt < c.repliedAt)) {
    const age = (now.getTime() - c.repliedAt.getTime()) / HOUR;
    if (age >= SILENCE_NORMS.repliedHours) return { kind: "replied", since: c.repliedAt, silentHours: Math.floor(age), overdueHours: Math.floor(age - SILENCE_NORMS.repliedHours) };
  }
  if (c.stage === "PRESENTATION" && c.nextMeetingAt) {
    const left = (c.nextMeetingAt.getTime() - now.getTime()) / HOUR;
    if (left > 0 && left <= SILENCE_NORMS.meetingLeadHours) return { kind: "meeting_soon", since: c.nextMeetingAt, silentHours: 0, overdueHours: 0 };
  }
  const days = SILENCE_NORMS.stageDays[c.stage];
  const kind = KIND_OF_STAGE[c.stage];
  if (days === undefined || !kind) return null;
  const since = c.lastContactedAt ?? c.stageChangedAt;
  const silent = (now.getTime() - since.getTime()) / HOUR;
  return silent >= days * 24 ? { kind, since, silentHours: Math.floor(silent), overdueHours: Math.floor(silent - days * 24) } : null;
}

const TEMP_RANK = { HOT: 0, WARM: 1, COLD: 2 } as const;

/** Most urgent first: kind, then hotter, then longer overdue. */
export function compareSilence(a: { hit: SilenceHit; temperature: SilenceInput["temperature"] }, b: { hit: SilenceHit; temperature: SilenceInput["temperature"] }): number {
  return PRIORITY[a.hit.kind] - PRIORITY[b.hit.kind] || (a.temperature ? TEMP_RANK[a.temperature] : 3) - (b.temperature ? TEMP_RANK[b.temperature] : 3) || b.hit.overdueHours - a.hit.overdueHours;
}
