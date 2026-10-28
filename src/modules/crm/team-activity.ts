import { emptyCounts, METRIC_STAGE, type Counts } from "./tracker";

/** After this many days without a sign of work a person is "quiet", and after the second number "long gone". */
export const QUIET_DAYS = 3;
export const GONE_DAYS = 7;
export const PERIODS = [7, 30] as const;

export type ActivityStatus = "active" | "quiet" | "gone" | "never";

/** Where a person stands by the time of their last action: today and yesterday and the day before are active, then quiet, then long gone. */
export function activityStatus(lastAt: Date | null, now: Date, quietDays = QUIET_DAYS, goneDays = GONE_DAYS): ActivityStatus {
  if (!lastAt) return "never";
  const days = (now.getTime() - lastAt.getTime()) / 86_400_000;
  return days < quietDays ? "active" : days < goneDays ? "quiet" : "gone";
}

export interface WorkCounts extends Counts {
  /** Tasks finished. */
  tasks: number;
}
export const emptyWork = (): WorkCounts => ({ ...emptyCounts(), tasks: 0 });

/** What a person did, counted from what happened: each move into a funnel stage, calls and meetings held, tasks finished. */
export function countWork(events: readonly { fromStage: string | null; toStage: string }[], activities: readonly { type: string }[]): WorkCounts {
  const c = emptyWork();
  for (const e of events) {
    if (e.fromStage === null) c.added++;
    for (const [m, stage] of Object.entries(METRIC_STAGE)) if (e.toStage === stage) c[m as keyof Counts]++;
  }
  for (const a of activities) {
    if (a.type === "CALL" || a.type === "MEETING") c.meetings++;
    else if (a.type === "TASK") c.tasks++;
  }
  return c;
}

/** The most recent of some moments; null when there are none. */
export function latest(...moments: (Date | null | undefined)[]): Date | null {
  let best: Date | null = null;
  for (const m of moments) if (m && (!best || m > best)) best = m;
  return best;
}

/**
 * The first line below you: partners with no partner above them, climbing through sponsors the way the network map does
 * (a person who is not a partner is passed over). Your own card is the top and never counted.
 */
export function firstLineIds(people: readonly { id: string; stage: string; sponsorId: string | null }[], selfId: string | null): string[] {
  const by = new Map(people.map((p) => [p.id, p]));
  const partnerAbove = (id: string): string | null => {
    const seen = new Set([id]);
    let cur = by.get(id)?.sponsorId ?? null;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      if (cur === selfId) return null;
      const p = by.get(cur);
      if (!p) return null;
      if (p.stage === "PARTNER") return p.id;
      cur = p.sponsorId;
    }
    return null;
  };
  return people.filter((p) => p.stage === "PARTNER" && p.id !== selfId && partnerAbove(p.id) === null).map((p) => p.id);
}
