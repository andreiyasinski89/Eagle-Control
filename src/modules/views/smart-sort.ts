/**
 * Smart sort for the timeline: puts the tasks one after another, each person's tasks in their own queue, taking the length of every task
 * from its estimate. A story point is 10 minutes, an hour is 60; a task with no estimate counts as a whole working day. Only working days
 * (Monday to Friday) are used. Tasks that block others come first, then the earlier deadline, then the order they already had.
 */

export const SP_MINUTES = 10;
export const HOUR_MINUTES = 60;
export const DEFAULT_DAY_MINUTES = 8 * 60;

export type Unit = "HOURS" | "STORY_POINTS";

export interface SortItem {
  id: string;
  title: string;
  assigneeId: string | null;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  estimation: number | null;
  /** The task's own unit; null follows the project's. */
  estimationUnit: Unit | null;
  position: number;
}

export interface BlockLink {
  /** This task blocks `toNodeId`: the other cannot start before it ends. */
  fromNodeId: string;
  toNodeId: string;
}

export interface SortOptions {
  /** First day of the plan, YYYY-MM-DD; a weekend moves to the Monday after. */
  startDate: string;
  /** Minutes of work in a day. */
  dayMinutes?: number;
  /** The unit an estimate has when the task has none of its own (the project's). */
  defaultUnit?: Unit;
}

export interface Move {
  id: string;
  assigneeId: string | null;
  minutes: number;
  /** False when the task had no estimate and was given a day. */
  estimated: boolean;
  from: { start: string | null; due: string | null };
  to: { start: string; due: string };
  /** The new end is after the task's own deadline. */
  late: boolean;
}

const DAY_MS = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** A day is YYYY-MM-DD; a full ISO time is cut to its day. */
const ms = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00.000Z`).getTime();
const isWorkday = (day: string) => {
  const d = new Date(`${day.slice(0, 10)}T00:00:00.000Z`).getUTCDay();
  return d !== 0 && d !== 6;
};

/** The first working day on or after `day`. */
export function firstWorkday(day: string): string {
  let t = ms(day);
  while (!isWorkday(iso(t))) t += DAY_MS;
  return iso(t);
}

/** The n-th working day counted from `start` (0 is the first working day on or after it). */
export function workdayAt(start: string, n: number): string {
  let t = ms(firstWorkday(start));
  let left = Math.max(0, Math.floor(n));
  while (left > 0) {
    t += DAY_MS;
    if (isWorkday(iso(t))) left--;
  }
  return iso(t);
}

/** How many working days lie from `start` up to, not including, `day`; 0 when `day` is not after it. */
export function workdaysBefore(start: string, day: string): number {
  const first = ms(firstWorkday(start));
  const end = ms(day);
  let n = 0;
  for (let t = first; t < end; t += DAY_MS) if (isWorkday(iso(t))) n++;
  return n;
}

/** The length of a task in minutes, and whether it came from an estimate. */
export function minutesOf(item: Pick<SortItem, "estimation" | "estimationUnit">, defaultUnit: Unit, dayMinutes: number): { minutes: number; estimated: boolean } {
  if (item.estimation === null || !(item.estimation > 0)) return { minutes: dayMinutes, estimated: false };
  const unit = item.estimationUnit ?? defaultUnit;
  return { minutes: Math.max(1, Math.round(item.estimation * (unit === "STORY_POINTS" ? SP_MINUTES : HOUR_MINUTES))), estimated: true };
}

const open = (status: string) => status !== "DONE" && status !== "CANCELLED";

/**
 * Lays out `items` (the tasks to place; finished ones and containers are left to the caller to leave out) and returns where each goes.
 * `others` are tasks that are not being moved but may block these: a blocker that is not finished and has a due date holds its dependants
 * until the day after it.
 */
export function planSchedule(items: readonly SortItem[], links: readonly BlockLink[], opts: SortOptions, others: readonly Pick<SortItem, "id" | "status" | "dueDate">[] = []): Move[] {
  const dayMinutes = opts.dayMinutes && opts.dayMinutes > 0 ? opts.dayMinutes : DEFAULT_DAY_MINUTES;
  const defaultUnit = opts.defaultUnit ?? "HOURS";
  const start = firstWorkday(opts.startDate);
  const todo = items.filter((i) => open(i.status));
  const inSet = new Set(todo.map((i) => i.id));
  const blockers = new Map<string, string[]>();
  for (const l of links) if (l.fromNodeId !== l.toNodeId) blockers.set(l.toNodeId, [...(blockers.get(l.toNodeId) ?? []), l.fromNodeId]);
  const outside = new Map(others.map((o) => [o.id, o]));

  // The order: earlier deadline first, then the old start, then the old position; a task waits until its blockers are placed.
  const base = [...todo].sort(
    (a, b) =>
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999") || a.position - b.position || a.title.localeCompare(b.title),
  );
  const placed = new Set<string>();
  const order: SortItem[] = [];
  const left = [...base];
  while (left.length) {
    const i = left.findIndex((t) => (blockers.get(t.id) ?? []).every((b) => !inSet.has(b) || placed.has(b) || b === t.id));
    const [next] = left.splice(i === -1 ? 0 : i, 1); // a loop of blockers: take the first rather than stall
    placed.add((next as SortItem).id);
    order.push(next as SortItem);
  }

  const cursor = new Map<string, number>();
  const endOf = new Map<string, number>();
  const moves: Move[] = [];
  for (const t of order) {
    const who = t.assigneeId ?? "";
    let from = cursor.get(who) ?? 0;
    for (const b of blockers.get(t.id) ?? []) {
      // The timeline works in whole days and marks a task that starts on its blocker's last day as a clash: start on the day after it.
      if (endOf.has(b)) from = Math.max(from, (Math.floor(((endOf.get(b) as number) - 1) / dayMinutes) + 1) * dayMinutes);
      else {
        const o = outside.get(b);
        if (o && open(o.status) && o.dueDate) from = Math.max(from, workdaysBefore(start, o.dueDate) * dayMinutes + dayMinutes);
      }
    }
    const { minutes, estimated } = minutesOf(t, defaultUnit, dayMinutes);
    const to = from + minutes;
    cursor.set(who, to);
    endOf.set(t.id, to);
    const dueDate = workdayAt(start, Math.floor((to - 1) / dayMinutes));
    moves.push({
      id: t.id,
      assigneeId: t.assigneeId,
      minutes,
      estimated,
      from: { start: t.startDate, due: t.dueDate },
      to: { start: workdayAt(start, Math.floor(from / dayMinutes)), due: dueDate },
      late: !!t.dueDate && dueDate > t.dueDate.slice(0, 10),
    });
  }
  return moves;
}

/** "1 h 20 min", "45 min", "2 d 3 h" for a length in minutes; a day is `dayMinutes`. */
export function formatMinutes(total: number, dayMinutes = DEFAULT_DAY_MINUTES): { d: number; h: number; m: number } {
  const d = Math.floor(total / dayMinutes);
  const rest = total - d * dayMinutes;
  return { d, h: Math.floor(rest / 60), m: rest % 60 };
}
