import type { NodeStatus } from "@prisma/client";

const DAY = 86_400_000;
const dayStart = (d: Date) => Math.floor(d.getTime() / DAY) * DAY;
export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

export interface StatusEv {
  nodeId: string;
  at: Date;
  from: NodeStatus | null;
  to: NodeStatus;
}

export interface Task {
  id: string;
  /** estimation, or 1 when the task has none */
  weight: number;
  sprintId: string | null;
}

export const FLOW_COLUMNS = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
export type FlowColumn = (typeof FLOW_COLUMNS)[number];

function byNode(events: readonly StatusEv[]): Map<string, StatusEv[]> {
  const map = new Map<string, StatusEv[]>();
  for (const e of [...events].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const list = map.get(e.nodeId);
    if (list) list.push(e);
    else map.set(e.nodeId, [e]);
  }
  return map;
}

/** Current status and the moment the task last became DONE (null while it is not done). */
export function doneInfo(events: readonly StatusEv[]): Map<string, { status: NodeStatus; doneAt: Date | null; startedAt: Date | null }> {
  const out = new Map<string, { status: NodeStatus; doneAt: Date | null; startedAt: Date | null }>();
  for (const [id, list] of byNode(events)) {
    const last = list[list.length - 1] as StatusEv;
    const lastDone = [...list].reverse().find((e) => e.to === "DONE");
    const started = list.find((e) => e.to === "IN_PROGRESS" || e.to === "IN_REVIEW");
    out.set(id, { status: last.to, doneAt: last.to === "DONE" && lastDone ? lastDone.at : null, startedAt: started?.at ?? null });
  }
  return out;
}

export interface FlowPoint {
  date: string;
  BACKLOG: number;
  TODO: number;
  IN_PROGRESS: number;
  IN_REVIEW: number;
  DONE: number;
}

/**
 * Cumulative flow: how many tasks sat in each column at the end of every day, replayed from the status history.
 * Cancelled tasks drop out; tasks that do not exist yet are not counted. Capped at 180 days.
 */
export function cumulativeFlow(events: readonly StatusEv[], from: Date, to: Date): FlowPoint[] {
  const perNode = byNode(events);
  const first = dayStart(from);
  const last = Math.min(dayStart(to), first + 180 * DAY);
  const cursor = new Map<string, number>();
  const current = new Map<string, NodeStatus>();
  const points: FlowPoint[] = [];
  for (let t = first; t <= last; t += DAY) {
    const end = t + DAY;
    for (const [id, list] of perNode) {
      let i = cursor.get(id) ?? 0;
      while (i < list.length && (list[i] as StatusEv).at.getTime() < end) {
        current.set(id, (list[i] as StatusEv).to);
        i++;
      }
      cursor.set(id, i);
    }
    const p: FlowPoint = { date: dayKey(t), BACKLOG: 0, TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0 };
    for (const s of current.values()) if (s !== "CANCELLED") p[s as FlowColumn]++;
    points.push(p);
  }
  return points;
}

/** Nearest-rank percentile of an ascending list; null for an empty one. */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? null;
}

export interface CycleSummary {
  count: number;
  average: number | null;
  p50: number | null;
  p85: number | null;
  p95: number | null;
}

/**
 * Cycle time in days, from the first move into progress to the last move to done, for tasks that are done now.
 * Tasks that never passed through progress (imported as done) have no cycle and are skipped.
 */
export function cycleTimes(events: readonly StatusEv[]): { days: number[]; summary: CycleSummary } {
  const days: number[] = [];
  for (const info of doneInfo(events).values()) {
    if (!info.doneAt || !info.startedAt) continue;
    const d = (info.doneAt.getTime() - info.startedAt.getTime()) / DAY;
    if (d >= 0) days.push(round1(d));
  }
  days.sort((a, b) => a - b);
  const avg = days.length ? round1(days.reduce((s, d) => s + d, 0) / days.length) : null;
  return { days, summary: { count: days.length, average: avg, p50: percentile(days, 50), p85: percentile(days, 85), p95: percentile(days, 95) } };
}

/** Monday 00:00 UTC of the week containing `ms`. */
const weekOf = (ms: number) => {
  const d = dayStart(new Date(ms));
  return d - ((new Date(d).getUTCDay() + 6) % 7) * DAY;
};

/** Tasks finished per week for the last `weeks` weeks (current one included), oldest first. */
export function throughput(events: readonly StatusEv[], weeks: number, today: Date, weights: ReadonlyMap<string, number> = new Map()): { week: string; done: number; weight: number }[] {
  const info = doneInfo(events);
  const lastWeek = weekOf(today.getTime());
  const out = Array.from({ length: weeks }, (_, i) => ({ week: dayKey(lastWeek - (weeks - 1 - i) * 7 * DAY), done: 0, weight: 0 }));
  for (const [id, i] of info) {
    if (!i.doneAt) continue;
    const key = dayKey(weekOf(i.doneAt.getTime()));
    const bucket = out.find((o) => o.week === key);
    if (bucket) {
      bucket.done++;
      bucket.weight = round1(bucket.weight + (weights.get(id) ?? 1));
    }
  }
  return out;
}

export interface SprintInfo {
  id: string;
  title: string;
  startDate: Date | null;
  dueDate: Date | null;
}

export interface VelocityRow {
  sprintId: string;
  title: string;
  start: string | null;
  due: string | null;
  committed: number;
  completed: number;
  finished: boolean;
}

/**
 * Per sprint: the work it holds (`committed`) and what was finished by the end of its due day (`completed`).
 * Work finished after the sprint ended counts as carried over, not as that sprint's velocity.
 */
export function sprintVelocity(sprints: readonly SprintInfo[], tasks: readonly Task[], done: ReadonlyMap<string, { status: NodeStatus; doneAt: Date | null }>, today: Date): VelocityRow[] {
  return sprints
    .map((s) => {
      const mine = tasks.filter((t) => t.sprintId === s.id && done.get(t.id)?.status !== "CANCELLED");
      const cutoff = s.dueDate ? dayStart(s.dueDate) + DAY : Infinity;
      const completed = mine.filter((t) => {
        const d = done.get(t.id);
        return d?.status === "DONE" && (!d.doneAt || d.doneAt.getTime() < cutoff);
      });
      return {
        sprintId: s.id,
        title: s.title,
        start: s.startDate ? dayKey(s.startDate.getTime()) : null,
        due: s.dueDate ? dayKey(s.dueDate.getTime()) : null,
        committed: round1(mine.reduce((a, t) => a + t.weight, 0)),
        completed: round1(completed.reduce((a, t) => a + t.weight, 0)),
        finished: !!s.dueDate && dayStart(s.dueDate) + DAY <= today.getTime(),
      };
    })
    .sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9") || a.title.localeCompare(b.title));
}

/** Average completed work of the last `n` finished sprints; null before any sprint has ended. */
export function averageVelocity(rows: readonly VelocityRow[], n = 3): number | null {
  const finished = rows.filter((r) => r.finished).slice(-n);
  return finished.length ? round1(finished.reduce((s, r) => s + r.completed, 0) / finished.length) : null;
}

/** Counts per bucket: `edges` [1,2,3] gives <1, 1–<2, 2–<3 and 3+. */
export function histogram(values: readonly number[], edges: readonly number[]): { from: number; to: number | null; count: number }[] {
  const rows = [...edges, Infinity].map((hi, i) => ({ from: i === 0 ? 0 : (edges[i - 1] as number), to: hi === Infinity ? null : hi, count: 0 }));
  for (const v of values) {
    const i = rows.findIndex((r) => r.to === null || v < r.to);
    (rows[i] as { count: number }).count++;
  }
  return rows;
}
