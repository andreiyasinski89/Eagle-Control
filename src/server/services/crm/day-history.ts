import { after } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { addDays } from "@/modules/crm/tracker";
import { average, buildPoints, HISTORY_PERIODS, periodRange, trend, type DayRow } from "@/modules/crm/day-history";
import { isValidTimeZone, todayIn, zonedToUtc } from "@/modules/views/tz";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { computeMyDay } from "./my-day";

export const historySchema = z.object({ period: z.enum(HISTORY_PERIODS).default("week") });

/** What the plan of a day holds (the `plan` of My day). */
interface Plan {
  tasks: { planned: number; done: number };
  meetings: { planned: number; done: number };
  followUps: { planned: number; done: number };
  backlogOpen: number;
  backlogCleared: number;
  trackedMinutes: number;
  efficiency: number | null;
  productivity: number | null;
}

const asDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

/** Saves the numbers of a day. A day that wanted nothing from the person is not saved (it would be a zero that was never earned), and a closed day is not changed by a later look. */
export async function recordDayScore(userId: string, workspaceId: string, day: string, plan: Plan, closed = false): Promise<void> {
  if (plan.tasks.planned + plan.meetings.planned + plan.followUps.planned + plan.backlogOpen + plan.backlogCleared === 0) return;
  const data = {
    tasksPlanned: plan.tasks.planned,
    tasksDone: plan.tasks.done,
    meetingsPlanned: plan.meetings.planned,
    meetingsDone: plan.meetings.done,
    followUpsPlanned: plan.followUps.planned,
    followUpsDone: plan.followUps.done,
    backlogOpen: plan.backlogOpen,
    backlogCleared: plan.backlogCleared,
    trackedMinutes: plan.trackedMinutes,
    efficiency: plan.efficiency,
    productivity: plan.productivity,
    closed,
  };
  const where = { userId_workspaceId_day: { userId, workspaceId, day: asDate(day) } };
  const cur = await db.dayScore.findUnique({ where, select: { closed: true } });
  if (cur?.closed && !closed) return;
  await db.dayScore.upsert({ where, create: { userId, workspaceId, day: asDate(day), ...data }, update: data });
}

/** Works out a finished day as it stood at its end and keeps it as final. Nothing is done when it is closed already. */
export async function closeDay(userId: string, workspaceId: string, day: string, timeZone: string): Promise<void> {
  const where = { userId_workspaceId_day: { userId, workspaceId, day: asDate(day) } };
  if ((await db.dayScore.findUnique({ where, select: { closed: true } }))?.closed) return;
  const endOfDay = new Date(zonedToUtc(addDays(day, 1), "00:00", timeZone).getTime() - 1);
  const r = await computeMyDay(userId, workspaceId, endOfDay);
  await recordDayScore(userId, workspaceId, day, r.plan, true);
}

/** Work that may be done after the answer has gone: with Next's `after`, and where there is no request (scripts) right away; never in tests. */
function inBackground(fn: () => Promise<void>) {
  if (process.env.NODE_ENV === "test") return;
  const run = () => fn().catch((e) => console.error("day history", e instanceof Error ? e.message : e));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Called when My day is looked at: today's numbers are saved, and yesterday is closed in the background if nobody closed it. */
export async function keepDay(userId: string, workspaceId: string, today: string, timeZone: string, plan: Plan): Promise<void> {
  await recordDayScore(userId, workspaceId, today, plan);
  inBackground(() => closeDay(userId, workspaceId, addDays(today, -1), timeZone));
}

/** The nightly job: yesterday is closed for everybody who has worked with the plan lately, in their own time zone, whether they opened the app or not. */
export async function closeYesterdays(now = new Date()): Promise<{ checked: number; failed: number }> {
  const since = new Date(now.getTime() - 16 * 86_400_000);
  const pairs = await db.dayScore.groupBy({ by: ["userId", "workspaceId"], where: { day: { gte: since } } });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(pairs.map((p) => p.userId))] }, deletedAt: null }, select: { id: true, timezone: true } });
  const zone = new Map(users.map((u) => [u.id, isValidTimeZone(u.timezone) ? u.timezone : "UTC"]));
  let failed = 0;
  for (const p of pairs) {
    const tz = zone.get(p.userId);
    if (!tz) continue;
    try {
      await closeDay(p.userId, p.workspaceId, addDays(todayIn(tz, now), -1), tz);
    } catch (e) {
      failed++;
      console.error("closing a day failed", e instanceof Error ? e.message : e);
    }
  }
  return { checked: pairs.length, failed };
}

const toRow = (r: Awaited<ReturnType<typeof db.dayScore.findFirstOrThrow>>): DayRow => ({
  day: dayOf(r.day),
  planned: r.tasksPlanned + r.meetingsPlanned + r.followUpsPlanned,
  done: Math.min(r.tasksDone, r.tasksPlanned) + Math.min(r.meetingsDone, r.meetingsPlanned) + Math.min(r.followUpsDone, r.followUpsPlanned),
  tasks: { planned: r.tasksPlanned, done: r.tasksDone },
  meetings: { planned: r.meetingsPlanned, done: r.meetingsDone },
  followUps: { planned: r.followUpsPlanned, done: r.followUpsDone },
  backlogOpen: r.backlogOpen,
  backlogCleared: r.backlogCleared,
  trackedMinutes: r.trackedMinutes,
  efficiency: r.efficiency,
  productivity: r.productivity,
});

/**
 * The person's own history of the day plan for a span: the days (or the weeks) for the chart, the averages, how they compare with the span just before,
 * and, for "yesterday", the two days to set side by side. Nobody else's numbers are ever given.
 */
export async function getDayHistory(userId: string, workspaceId: string, f: z.infer<typeof historySchema>, now = new Date()) {
  await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const me = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const tz = me && isValidTimeZone(me.timezone) ? me.timezone : "UTC";
  const today = todayIn(tz, now);
  const first = await db.dayScore.findFirst({ where: { userId, workspaceId }, orderBy: { day: "asc" }, select: { day: true } });
  const range = periodRange(f.period, today, first ? dayOf(first.day) : null);
  const from = range.prev ? range.prev.from : range.from;
  const saved = (await db.dayScore.findMany({ where: { userId, workspaceId, day: { gte: asDate(from), lte: asDate(range.to) } }, orderBy: { day: "asc" }, take: 4000 })).map(toRow);

  const inRange = saved.filter((r) => r.day >= range.from && r.day <= range.to);
  const before = range.prev ? saved.filter((r) => r.day >= (range.prev as { from: string }).from && r.day <= (range.prev as { to: string }).to) : [];
  const avg = average(inRange);
  const prev = range.prev ? average(before) : null;
  const byDay = new Map(saved.map((r) => [r.day, r]));
  const todayRow = byDay.get(today) ?? (f.period === "yesterday" ? ((await db.dayScore.findUnique({ where: { userId_workspaceId_day: { userId, workspaceId, day: asDate(today) } } }).then((r) => (r ? toRow(r) : null))) ?? null) : null);
  return {
    period: f.period,
    today,
    range: { from: range.from, to: range.to, bucket: range.bucket },
    points: buildPoints(inRange, range),
    // The days themselves, to look at one: only when each point is one day.
    days: range.bucket === "day" ? inRange : [],
    average: avg,
    previous: prev,
    trend: { efficiency: trend(avg.efficiency, prev?.efficiency ?? null), productivity: trend(avg.productivity, prev?.productivity ?? null) },
    yesterday: f.period === "yesterday" ? (inRange[0] ?? null) : null,
    todayRow: f.period === "yesterday" ? todayRow : null,
    savedDays: first ? await db.dayScore.count({ where: { userId, workspaceId } }) : 0,
    since: first ? dayOf(first.day) : null,
  };
}
