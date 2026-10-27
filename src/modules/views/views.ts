import type { Health, NodeStatus, NodeType } from "@prisma/client";

const DAY = 86_400_000;

export const VIEW_KINDS = ["map", "kanban", "list", "calendar", "timeline"] as const;
export type ViewKind = (typeof VIEW_KINDS)[number];

export function parseView(v: string | null | undefined): ViewKind {
  return (VIEW_KINDS as readonly string[]).includes(v ?? "") ? (v as ViewKind) : "map";
}

/** What the table, board, calendar and timeline show: the work itself, not the structure above it. */
export interface WorkItem {
  id: string;
  parentId: string | null;
  type: NodeType;
  title: string;
  status: NodeStatus;
  progress: number;
  health: Health;
  assigneeId: string | null;
  startDate: string | null;
  dueDate: string | null;
  estimation: number | null;
  estimationUnit?: "HOURS" | "STORY_POINTS" | null;
  blocked: boolean;
}

export const WORK_TYPES: readonly NodeType[] = ["TASK", "SUBTASK"];
export const BOARD_COLUMNS = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const satisfies readonly NodeStatus[];

export function workItems<T extends WorkItem>(nodes: readonly T[], types: readonly NodeType[] = WORK_TYPES): T[] {
  return nodes.filter((n) => types.includes(n.type));
}

/** Cancelled work has no column; it is reachable from the list view. */
export function groupByStatus<T extends Pick<WorkItem, "status">>(items: readonly T[]): Record<(typeof BOARD_COLUMNS)[number], T[]> {
  const out = { BACKLOG: [], TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] } as Record<(typeof BOARD_COLUMNS)[number], T[]>;
  for (const i of items) if (i.status in out) out[i.status as (typeof BOARD_COLUMNS)[number]].push(i);
  return out;
}

// ── list ───────────────────────────────────────────────────────────────────

export type SortKey = "title" | "status" | "assignee" | "due" | "progress" | "estimation";
export type SortDir = "asc" | "desc";
const STATUS_ORDER: Record<NodeStatus, number> = { BACKLOG: 0, TODO: 1, IN_PROGRESS: 2, IN_REVIEW: 3, DONE: 4, CANCELLED: 5 };

/** Stable. Empty values sink to the bottom in both directions, so "no due date" never tops a sort. */
export function sortItems<T extends WorkItem>(items: readonly T[], key: SortKey, dir: SortDir, assigneeName: (id: string | null) => string): T[] {
  const value = (i: T): string | number | null => {
    switch (key) {
      case "title":
        return i.title.toLowerCase();
      case "status":
        return STATUS_ORDER[i.status];
      case "assignee":
        return i.assigneeId ? assigneeName(i.assigneeId).toLowerCase() : null;
      case "due":
        return i.dueDate;
      case "progress":
        return i.progress;
      case "estimation":
        return i.estimation;
    }
  };
  const sign = dir === "asc" ? 1 : -1;
  return items
    .map((item, index) => ({ item, index, v: value(item) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.index - b.index;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      const c = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : String(a.v).localeCompare(String(b.v));
      return c !== 0 ? c * sign : a.index - b.index;
    })
    .map((x) => x.item);
}

// ── calendar ───────────────────────────────────────────────────────────────

export const dayOf = (iso: string): string => iso.slice(0, 10);
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);
const parseDay = (s: string) => new Date(`${s}T00:00:00.000Z`);

/** Six Monday-first weeks covering the month (`month` is 0–11), as day keys. Always 42 cells so the grid never jumps. */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const start = first.getTime() - lead * DAY;
  return Array.from({ length: 42 }, (_, i) => isoDay(new Date(start + i * DAY)));
}

export function weekGrid(anchor: string): string[] {
  const d = parseDay(anchor);
  const start = d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY;
  return Array.from({ length: 7 }, (_, i) => isoDay(new Date(start + i * DAY)));
}

export const addDays = (day: string, n: number): string => isoDay(new Date(parseDay(day).getTime() + n * DAY));

export function addMonths(day: string, n: number): string {
  const d = parseDay(day);
  return isoDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
}

/** Items keyed by the day they fall due. Items without a due date are not on the calendar. */
export function byDay<T extends { dueDate: string | null }>(items: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const i of items) {
    if (!i.dueDate) continue;
    const k = dayOf(i.dueDate);
    const list = map.get(k);
    if (list) list.push(i);
    else map.set(k, [i]);
  }
  return map;
}

// ── timeline ───────────────────────────────────────────────────────────────

export const ROW_HEIGHT = 34;
export const BAR_HEIGHT = 20;

export interface Bar {
  id: string;
  row: number;
  x: number;
  y: number;
  w: number;
  start: string;
  end: string;
}

export interface TimelineModel {
  rangeStart: string;
  days: number;
  bars: Bar[];
  /** Items with no dates at all: listed beside the chart, not drawn on it. */
  unscheduled: string[];
  todayX: number | null;
}

/**
 * Lays scheduled items out on a day axis. An item with one date is a one-day bar; one with both spans them
 * (a start after the due date is read as a one-day bar on the due date). The axis gets a week of air on each side.
 */
export function buildTimeline(items: readonly Pick<WorkItem, "id" | "startDate" | "dueDate">[], today: string, pxPerDay: number): TimelineModel {
  const scheduled: { id: string; start: string; end: string }[] = [];
  const unscheduled: string[] = [];
  for (const i of items) {
    const s = i.startDate ? dayOf(i.startDate) : null;
    const e = i.dueDate ? dayOf(i.dueDate) : null;
    if (!s && !e) {
      unscheduled.push(i.id);
      continue;
    }
    const end = e ?? (s as string);
    const start = s && s <= end ? s : end;
    scheduled.push({ id: i.id, start, end });
  }
  const lo = scheduled.reduce((m, x) => (x.start < m ? x.start : m), scheduled[0]?.start ?? today);
  const hi = scheduled.reduce((m, x) => (x.end > m ? x.end : m), scheduled[0]?.end ?? today);
  const rangeStart = addDays(lo < today ? lo : today, -7);
  const rangeEnd = addDays(hi > today ? hi : today, 7);
  const origin = parseDay(rangeStart).getTime();
  const index = (d: string) => Math.round((parseDay(d).getTime() - origin) / DAY);
  const days = index(rangeEnd) + 1;
  const bars = scheduled.map((x, row) => ({
    id: x.id,
    row,
    x: index(x.start) * pxPerDay,
    y: row * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2,
    w: (index(x.end) - index(x.start) + 1) * pxPerDay,
    start: x.start,
    end: x.end,
  }));
  return { rangeStart, days, bars, unscheduled, todayX: index(today) * pxPerDay + pxPerDay / 2 };
}

export interface Arrow {
  from: string;
  to: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** The blocker ends after the blocked item starts: the plan cannot work as drawn. */
  conflict: boolean;
}

/** One arrow per BLOCKS link whose two ends are both on the chart: from the blocker's end to the blocked item's start. */
export function buildArrows(bars: readonly Bar[], links: readonly { fromNodeId: string; toNodeId: string }[]): Arrow[] {
  const byId = new Map(bars.map((b) => [b.id, b]));
  const out: Arrow[] = [];
  for (const l of links) {
    const a = byId.get(l.fromNodeId);
    const b = byId.get(l.toNodeId);
    if (!a || !b) continue;
    out.push({ from: a.id, to: b.id, x1: a.x + a.w, y1: a.y + BAR_HEIGHT / 2, x2: b.x, y2: b.y + BAR_HEIGHT / 2, conflict: a.end >= b.start });
  }
  return out;
}

/** A dragged bar moves whole days; both dates shift together so the duration is kept. */
export function shiftDates(startDate: string | null, dueDate: string | null, days: number): { startDate: string | null; dueDate: string | null } {
  const move = (d: string | null) => (d === null ? null : `${addDays(dayOf(d), days)}T00:00:00.000Z`);
  return { startDate: move(startDate), dueDate: move(dueDate) };
}
