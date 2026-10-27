import { z } from "zod";
import { db } from "@/server/db";
import { ApiError, conflict, forbidden, notFound } from "@/server/http/errors";
import { toCsv } from "@/modules/crm/csv";
import { dayKey, summarize, timerMinutes, weekDays, weekStart } from "@/modules/time/time";
import { daysBetween, PERIODS, periodRange, splitByLocalDays } from "@/modules/time/period";
import { isValidTimeZone, todayIn } from "@/modules/views/tz";
import { can } from "@/server/policies";
import { loadNode, loadWorkspaceMember, logActivity, type Tx } from "./nodes/access";

const DAY = 86_400_000;
const TRACKABLE = ["TASK", "SUBTASK"];

const invalid = (code: string, message: string) => new ApiError(422, code, message);

export const entrySchema = z.object({
  minutes: z.number().int().min(1).max(24 * 60),
  date: z.string().date(),
  billable: z.boolean().default(true),
  note: z.string().trim().max(500).nullable().optional(),
});
export const patchEntrySchema = entrySchema.partial().refine((v) => Object.keys(v).length > 0, "Nothing to update");

export interface EntryDto {
  id: string;
  nodeId: string | null;
  label: string | null;
  userId: string;
  userName: string | null;
  minutes: number;
  date: string;
  billable: boolean;
  note: string | null;
}

const toDto = (e: { id: string; nodeId: string | null; label: string | null; userId: string; minutes: number; date: Date; billable: boolean; note: string | null; user: { name: string | null; email: string } }): EntryDto => ({
  id: e.id,
  nodeId: e.nodeId,
  label: e.label,
  userId: e.userId,
  userName: e.user.name ?? e.user.email,
  minutes: e.minutes,
  date: dayKey(e.date),
  billable: e.billable,
  note: e.note,
});
const userSel = { select: { name: true, email: true } } as const;

async function trackable(tx: Tx, userId: string, nodeId: string) {
  const access = await loadNode(tx, userId, nodeId, "node:write");
  if (!TRACKABLE.includes(access.node.type)) throw invalid("not_trackable", "Time is logged on tasks and subtasks");
  if (access.node.archivedAt) throw conflict("archived", "The task is archived");
  return access;
}

/** Whoever logs more than a day into a day is mistaken; stops typos like 600 instead of 60. */
async function assertDayCapacity(tx: Tx, userId: string, date: Date, minutes: number, ignoreId?: string) {
  const sum = await tx.timeEntry.aggregate({ where: { userId, date, ...(ignoreId ? { id: { not: ignoreId } } : {}) }, _sum: { minutes: true } });
  if ((sum._sum.minutes ?? 0) + minutes > 24 * 60) throw invalid("day_overflow", "That would be more than 24 hours on one day");
}

const asDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

export async function addEntry(userId: string, nodeId: string, input: z.infer<typeof entrySchema>, now = new Date()) {
  return db.$transaction(async (tx) => {
    const { node } = await trackable(tx, userId, nodeId);
    const date = asDate(input.date);
    if (date.getTime() > now.getTime() + DAY) throw invalid("future_date", "Time cannot be logged for the future");
    await assertDayCapacity(tx, userId, date, input.minutes);
    const e = await tx.timeEntry.create({ data: { nodeId, workspaceId: node.workspaceId, userId, minutes: input.minutes, date, billable: input.billable, note: input.note ?? null }, include: { user: userSel } });
    await logActivity(tx, { workspaceId: node.workspaceId, nodeId, actorId: userId, action: "time.logged", diff: { minutes: input.minutes } });
    return toDto(e);
  });
}

async function loadEntry(tx: Tx, userId: string, id: string) {
  const e = await tx.timeEntry.findUnique({ where: { id }, include: { user: userSel } });
  if (!e) throw notFound("time entry");
  const m = await loadWorkspaceMember(tx, userId, e.workspaceId, "workspace:read");
  if (e.userId !== userId && !can(m, "member:invite")) throw forbidden(); // own entries, or an owner/admin correcting someone's
  return e;
}

export async function updateEntry(userId: string, id: string, patch: z.infer<typeof patchEntrySchema>) {
  return db.$transaction(async (tx) => {
    const cur = await loadEntry(tx, userId, id);
    const date = patch.date ? asDate(patch.date) : cur.date;
    const minutes = patch.minutes ?? cur.minutes;
    if (patch.date || patch.minutes) await assertDayCapacity(tx, cur.userId, date, minutes, id);
    const e = await tx.timeEntry.update({ where: { id }, data: { minutes, date, billable: patch.billable, note: patch.note }, include: { user: userSel } });
    return toDto(e);
  });
}

export async function deleteEntry(userId: string, id: string) {
  await db.$transaction(async (tx) => {
    await loadEntry(tx, userId, id);
    await tx.timeEntry.delete({ where: { id } });
  });
}

export async function listEntries(userId: string, nodeId: string) {
  await loadNode(db, userId, nodeId);
  const rows = await db.timeEntry.findMany({ where: { nodeId }, orderBy: [{ date: "desc" }, { id: "desc" }], include: { user: userSel }, take: 200 });
  return rows.map(toDto);
}

/** Minutes logged on the node itself and on everything below it. */
export async function timeTotals(tx: Tx | typeof db, nodeIds: readonly string[], ownId: string) {
  const grouped = await tx.timeEntry.groupBy({ by: ["nodeId"], where: { nodeId: { in: [...nodeIds] } }, _sum: { minutes: true } });
  const total = grouped.reduce((s, g) => s + (g._sum.minutes ?? 0), 0);
  return { ownMinutes: grouped.find((g) => g.nodeId === ownId)?._sum.minutes ?? 0, totalMinutes: total };
}

// ── timer ──────────────────────────────────────────────────────────────────

async function zoneOf(tx: Tx | typeof db, userId: string): Promise<string> {
  const me = await tx.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return me && isValidTimeZone(me.timezone) ? me.timezone : "UTC";
}

/**
 * Stops the running timer and writes what it counted. The time is cut into the person's own calendar days (a timer left on over midnight
 * counts on both), and a day never holds more than 24 hours.
 */
async function flush(tx: Tx, userId: string, now: Date): Promise<EntryDto[]> {
  const running = await tx.runningTimer.findUnique({ where: { userId } });
  if (!running) return [];
  await tx.runningTimer.delete({ where: { userId } });
  const minutes = timerMinutes(running.startedAt, now);
  if (minutes === 0) return [];
  const tz = await zoneOf(tx, userId);
  const made: EntryDto[] = [];
  for (const part of splitByLocalDays(running.startedAt, now, tz, minutes)) {
    const date = asDate(part.day);
    const room = 24 * 60 - ((await tx.timeEntry.aggregate({ where: { userId, date }, _sum: { minutes: true } }))._sum.minutes ?? 0);
    if (room <= 0) continue;
    const e = await tx.timeEntry.create({ data: { nodeId: running.nodeId, workspaceId: running.workspaceId, label: running.label, userId, minutes: Math.min(part.minutes, room), date, billable: running.nodeId !== null }, include: { user: userSel } });
    made.push(toDto(e));
  }
  return made;
}

export const startTimerSchema = z
  .object({ nodeId: z.string().min(1).optional(), workspaceId: z.string().min(1).optional(), label: z.string().trim().max(200).optional() })
  .refine((v) => v.nodeId || v.workspaceId, "Say which task, or which workspace the time is for");

/**
 * Starts the timer, on a task or, with no task, on a label of the person's own ("calls", "reading"). Starting a timer stops the previous
 * one and logs its time. It runs until the person stops it.
 */
export async function startTimer(userId: string, input: z.infer<typeof startTimerSchema>, now = new Date()) {
  return db.$transaction(async (tx) => {
    let workspaceId: string;
    if (input.nodeId) {
      workspaceId = (await trackable(tx, userId, input.nodeId)).node.workspaceId;
    } else {
      workspaceId = input.workspaceId as string;
      await loadWorkspaceMember(tx, userId, workspaceId, "node:write");
    }
    const stopped = await flush(tx, userId, now);
    await tx.runningTimer.create({ data: { userId, nodeId: input.nodeId ?? null, workspaceId, label: input.nodeId ? null : input.label || null, startedAt: now } });
    return { stopped: stopped[0] ?? null, timer: await currentTimer(tx, userId, now) };
  });
}

export async function stopTimer(userId: string, now = new Date()) {
  return db.$transaction(async (tx) => {
    const entries = await flush(tx, userId, now);
    return { entry: entries[0] ?? null, entries };
  });
}

export async function currentTimer(tx: Tx | typeof db, userId: string, now = new Date()) {
  const t = await tx.runningTimer.findUnique({ where: { userId }, include: { node: { select: { id: true, title: true, rootId: true } }, workspace: { select: { id: true, slug: true } } } });
  if (!t) return null;
  return {
    nodeId: t.nodeId,
    title: t.node?.title ?? t.label ?? "",
    label: t.label,
    projectId: t.node?.rootId ?? null,
    workspaceId: t.workspace.id,
    slug: t.workspace.slug,
    startedAt: t.startedAt,
    seconds: Math.max(0, Math.floor((now.getTime() - t.startedAt.getTime()) / 1000)),
  };
}

// ── timesheet ──────────────────────────────────────────────────────────────

export async function timesheet(userId: string, workspaceId: string, weekOf: Date) {
  await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const start = weekStart(weekOf);
  const end = new Date(start.getTime() + 7 * DAY);
  const rows = await db.timeEntry.findMany({
    where: { userId, workspaceId, date: { gte: start, lt: end } },
    include: { node: { select: { id: true, title: true, rootId: true } } },
    orderBy: { date: "asc" },
  });
  const projectIds = [...new Set(rows.map((r) => r.node?.rootId).filter((x): x is string => !!x))];
  const projects = await db.node.findMany({ where: { id: { in: projectIds } }, select: { id: true, title: true } });
  const title = new Map(projects.map((p) => [p.id, p.title]));
  const days = weekDays(start).map(dayKey);

  const byTask = new Map<string, { nodeId: string | null; title: string; projectId: string | null; projectTitle: string | null; perDay: Record<string, number>; total: number }>();
  for (const r of rows) {
    // Time with no task is grouped by what it was for.
    const key = r.nodeId ?? `label:${r.label ?? ""}`;
    const row = byTask.get(key) ?? { nodeId: r.nodeId, title: r.node?.title ?? r.label ?? "", projectId: r.node?.rootId ?? null, projectTitle: r.node?.rootId ? (title.get(r.node.rootId) ?? null) : null, perDay: {}, total: 0 };
    const k = dayKey(r.date);
    row.perDay[k] = (row.perDay[k] ?? 0) + r.minutes;
    row.total += r.minutes;
    byTask.set(key, row);
  }
  const perDay = Object.fromEntries(days.map((d) => [d, rows.filter((r) => dayKey(r.date) === d).reduce((s, r) => s + r.minutes, 0)]));
  return { weekStart: dayKey(start), days, tasks: [...byTask.values()].sort((a, b) => b.total - a.total), perDay, totalMinutes: rows.reduce((s, r) => s + r.minutes, 0), billableMinutes: rows.filter((r) => r.billable).reduce((s, r) => s + r.minutes, 0) };
}

// ── totals by day, week, month and all time ───────────────────────────────

export const summarySchema = z.object({ period: z.enum(PERIODS).default("week"), date: z.string().date().optional() });

const sumOf = async (where: Record<string, unknown>) => (await db.timeEntry.aggregate({ where, _sum: { minutes: true } }))._sum.minutes ?? 0;

/**
 * What a person spent, for a day, a week, a month or all time: the total, the time per day (per month for all time), per task or label,
 * and the entries themselves. Next to it the four totals of the header (today, this week, this month, all time).
 */
export async function timeSummary(userId: string, workspaceId: string, q: z.infer<typeof summarySchema>, now = new Date()) {
  await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const tz = await zoneOf(db, userId);
  const today = todayIn(tz, now);
  const anchor = q.date ?? today;
  const range = periodRange(q.period, anchor);
  const mine = { userId, workspaceId };
  const inRange = (r: { from: string; to: string } | null) => (r ? { ...mine, date: { gte: asDate(r.from), lte: asDate(r.to) } } : mine);
  const [dayTotal, weekTotal, monthTotal, allTotal] = await Promise.all([sumOf(inRange(periodRange("day", today))), sumOf(inRange(periodRange("week", today))), sumOf(inRange(periodRange("month", today))), sumOf(mine)]);

  const rows = await db.timeEntry.findMany({
    where: inRange(range),
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 5000,
    include: { node: { select: { id: true, title: true, rootId: true } } },
  });
  const projectIds = [...new Set(rows.map((r) => r.node?.rootId).filter((x): x is string => !!x))];
  const projects = projectIds.length ? await db.node.findMany({ where: { id: { in: projectIds } }, select: { id: true, title: true } }) : [];
  const projectTitle = new Map(projects.map((p) => [p.id, p.title]));

  const perKey = new Map<string, number>();
  const bucket = (day: string) => (q.period === "all" ? day.slice(0, 7) : day);
  for (const r of rows) perKey.set(bucket(dayKey(r.date)), (perKey.get(bucket(dayKey(r.date))) ?? 0) + r.minutes);
  const keys = range ? daysBetween(range.from, range.to) : [...perKey.keys()].sort().reverse();
  const series = keys.map((k) => ({ key: k, minutes: perKey.get(k) ?? 0 }));

  const byTask = new Map<string, { nodeId: string | null; title: string; projectTitle: string | null; minutes: number }>();
  for (const r of rows) {
    const key = r.nodeId ?? `label:${r.label ?? ""}`;
    const cur = byTask.get(key) ?? { nodeId: r.nodeId, title: r.node?.title ?? r.label ?? "", projectTitle: r.node?.rootId ? (projectTitle.get(r.node.rootId) ?? null) : null, minutes: 0 };
    cur.minutes += r.minutes;
    byTask.set(key, cur);
  }

  return {
    period: q.period,
    anchor,
    from: range?.from ?? null,
    to: range?.to ?? null,
    today,
    overview: { today: dayTotal, week: weekTotal, month: monthTotal, all: allTotal },
    totalMinutes: rows.reduce((s, r) => s + r.minutes, 0),
    billableMinutes: rows.filter((r) => r.billable).reduce((s, r) => s + r.minutes, 0),
    truncated: rows.length >= 5000,
    series,
    items: [...byTask.values()].sort((a, b) => b.minutes - a.minutes),
    entries: q.period === "all" ? [] : rows.slice(0, 300).map((r) => ({ id: r.id, nodeId: r.nodeId, title: r.node?.title ?? r.label ?? "", label: r.label, projectTitle: r.node?.rootId ? (projectTitle.get(r.node.rootId) ?? null) : null, date: dayKey(r.date), minutes: r.minutes, billable: r.billable, note: r.note })),
  };
}

// ── client report ──────────────────────────────────────────────────────────

export const reportQuerySchema = z.object({ from: z.string().date(), to: z.string().date(), currency: z.string().length(3).toUpperCase().default("EUR"), format: z.enum(["json", "csv"]).default("json") });

/**
 * Hours (and, for owners and admins, money) on all of a client's projects in a period. Projects belong to a
 * client through the deals they grew out of.
 */
export async function clientTimeReport(userId: string, companyId: string, q: z.infer<typeof reportQuerySchema>) {
  const company = await db.node.findUnique({ where: { id: companyId } });
  if (!company || company.type !== "COMPANY") throw notFound("company");
  const membership = await loadWorkspaceMember(db, userId, company.workspaceId, "crm:full");
  const showMoney = can(membership, "member:invite"); // owners and admins see rates and amounts
  const from = asDate(q.from);
  const to = asDate(q.to);
  if (to < from) throw invalid("invalid_period", "The end of the period is before its start");
  if (to.getTime() - from.getTime() > 366 * DAY) throw invalid("period_too_long", "Choose a period of at most a year");

  const links = await db.nodeLink.findMany({ where: { kind: "DEAL_PROJECT", from: { deal: { companyId } }, to: { archivedAt: null } }, select: { to: { select: { id: true, title: true, data: true } } } });
  const projects = [...new Map(links.map((l) => [l.to.id, l.to])).values()];
  const ids = projects.map((p) => p.id);
  const entries = ids.length
    ? (
        await db.timeEntry.findMany({
          where: { date: { gte: from, lte: to }, node: { OR: [{ id: { in: ids } }, { rootId: { in: ids } }] } },
          include: { node: { select: { id: true, title: true, rootId: true } }, user: { select: { id: true, name: true, email: true } } },
          orderBy: [{ date: "asc" }, { id: "asc" }],
        })
      ).flatMap((e) => (e.node ? [{ ...e, node: e.node }] : []))
    : [];

  const members = await db.membership.findMany({ where: { workspaceId: company.workspaceId }, select: { userId: true, hourlyRate: true } });
  const memberRate = new Map(members.map((m) => [m.userId, m.hourlyRate === null ? 0 : Number(m.hourlyRate)]));
  const projectRate = new Map(projects.map((p) => [p.id, typeof (p.data as { hourlyRate?: unknown }).hourlyRate === "number" ? (p.data as { hourlyRate: number }).hourlyRate : null]));
  const like = entries.map((e) => ({ minutes: e.minutes, billable: e.billable, userId: e.userId, projectId: e.node.rootId ?? e.node.id, date: e.date }));
  const rateFor = (e: { userId: string; projectId: string }) => projectRate.get(e.projectId) ?? memberRate.get(e.userId) ?? 0;

  const nameOf = new Map(entries.map((e) => [e.userId, e.user.name ?? e.user.email]));
  const titleOf = new Map(projects.map((p) => [p.id, p.title]));
  const hide = <T extends { amount: number }>(r: T) => (showMoney ? r : { ...r, amount: null as number | null });
  const byProject = summarize(like, "project", rateFor).map((r) => hide({ id: r.key, title: titleOf.get(r.key) ?? r.key, minutes: r.minutes, billableMinutes: r.billableMinutes, amount: r.amount }));
  const byMember = summarize(like, "user", rateFor).map((r) => hide({ id: r.key, name: nameOf.get(r.key) ?? r.key, minutes: r.minutes, billableMinutes: r.billableMinutes, amount: r.amount }));
  const byDay = summarize(like, "day", rateFor).map((r) => ({ day: r.key, minutes: r.minutes }));
  const totalAmount = Math.round(summarize(like, "project", rateFor).reduce((s, r) => s + r.amount, 0) * 100) / 100;
  const report = {
    company: { id: company.id, title: company.title },
    from: q.from,
    to: q.to,
    currency: q.currency,
    showMoney,
    totals: { minutes: like.reduce((s, e) => s + e.minutes, 0), billableMinutes: like.filter((e) => e.billable).reduce((s, e) => s + e.minutes, 0), amount: showMoney ? totalAmount : null },
    byProject,
    byMember,
    byDay,
    entries: entries.map((e) => ({ date: dayKey(e.date), project: titleOf.get(e.node.rootId ?? e.node.id) ?? "", task: e.node.title, person: e.user.name ?? e.user.email, minutes: e.minutes, billable: e.billable, note: e.note ?? "", amount: showMoney && e.billable ? Math.round((e.minutes / 60) * rateFor({ userId: e.userId, projectId: e.node.rootId ?? e.node.id }) * 100) / 100 : null })),
  };
  await db.activityLog.create({ data: { workspaceId: company.workspaceId, nodeId: null, actorId: userId, action: q.format === "csv" ? "export.time_report" : "view.time_report", diff: { companyId, from: q.from, to: q.to } } });
  return report;
}

export function timeReportCsv(r: Awaited<ReturnType<typeof clientTimeReport>>): string {
  const head = ["Date", "Project", "Task", "Person", "Hours", "Billable", ...(r.showMoney ? [`Amount (${r.currency})`] : []), "Note"];
  return toCsv(head, r.entries.map((e) => [e.date, e.project, e.task, e.person, (e.minutes / 60).toFixed(2), e.billable ? "yes" : "no", ...(r.showMoney ? [e.amount ?? ""] : []), e.note]));
}
