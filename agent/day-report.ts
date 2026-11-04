import { db } from "@/server/db";
import { addDays } from "@/modules/crm/tracker";
import { zonedToUtc } from "@/modules/views/tz";
import { computeMyDay } from "@/server/services/crm/my-day";
import { findSilentContacts } from "@/server/services/crm/silence";

/** How many people are named in a list; the rest is only counted. */
const NAMED = 10;
/** The pace is read from this many days back. */
const PACE_DAYS = 7;

const pair = (p: { planned: number; done: number }) => `${p.done} из ${p.planned}`;
const list = (names: string[]) => (names.length > NAMED ? `${names.slice(0, NAMED).join(", ")} и ещё ${names.length - NAMED}` : names.join(", "));
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

/**
 * The `{day_report}` of the evening role: the day's plan against fact, the funnel's movement, what stays undone,
 * who wrote back and waits, and the pace of the last days. It is worked out here, from the CRM, so the model only
 * has to put numbers into words and does not do arithmetic. `deadline` (YYYY-MM-DD) is optional and adds the days left.
 */
export async function dayReportFor(userId: string, workspaceId: string, now = new Date(), deadline?: string): Promise<string> {
  const day = await computeMyDay(userId, workspaceId, now);
  const from = zonedToUtc(day.date, "00:00", day.timeZone);
  const to = zonedToUtc(addDays(day.date, 1), "00:00", day.timeZone);

  const events = await db.contactStageEvent.findMany({
    where: { workspaceId, at: { gte: from, lt: to }, contact: { ownerId: userId } },
    select: { fromStage: true, toStage: true },
  });
  // A contact's first stage event has no "from": that is the contact being added, not the funnel moving.
  const added = events.filter((e) => e.fromStage === null).length;
  const moved = events.filter((e) => e.fromStage !== null);
  const moves = new Map<string, number>();
  for (const e of moved) moves.set(`${e.fromStage}→${e.toStage}`, (moves.get(`${e.fromStage}→${e.toStage}`) ?? 0) + 1);
  const gained = moved.filter((e) => e.toStage === "PARTNER" || e.toStage === "CLIENT");

  const open = day.contactsDue.filter((c) => !c.done);
  const waiting = (await findSilentContacts(userId, workspaceId, now)).filter((c) => c.hit.kind === "replied");

  const past = await db.dayScore.findMany({
    where: { userId, workspaceId, day: { gte: new Date(`${addDays(day.date, -PACE_DAYS)}T00:00:00.000Z`), lt: new Date(`${day.date}T00:00:00.000Z`) } },
    select: { followUpsDone: true, meetingsDone: true },
  });

  const left = deadline && /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? Math.round((Date.parse(`${deadline}T00:00:00Z`) - Date.parse(`${day.date}T00:00:00Z`)) / 86_400_000) : null;

  const lines = [
    `Дата: ${day.date} (${day.timeZone}).`,
    "План/факт за день:",
    `- касания: ${pair(day.plan.followUps)}`,
    `- встречи (презентации): ${pair(day.plan.meetings)}`,
    `- задачи: ${pair(day.plan.tasks)}`,
    `- новых партнёров и клиентов за день: ${gained.length}`,
    moved.length === 0 ? "Движение воронки за день: переходов между стадиями не было." : `Движение воронки за день: ${moved.length} переходов — ${[...moves].map(([k, n]) => `${k}: ${n}`).join("; ")}.`,
    `Добавлено новых контактов за день: ${added}.`,
    open.length === 0 ? "Осталось несделанным: контактов со следующим шагом на сегодня нет." : `Осталось несделанным: ${open.length} контактов со следующим шагом на сегодня или раньше — ${list(open.map((c) => `${c.name} (${c.stage})`))}.`,
    waiting.length === 0 ? "Ответили, а мы молчим больше 24 часов: таких нет." : `Ответили, а мы молчим больше 24 часов: ${waiting.length} — ${list(waiting.map((c) => c.name))}.`,
    past.length === 0 ? `Темп за последние ${PACE_DAYS} дней: истории дней пока нет.` : `Темп за последние ${PACE_DAYS} дней (дней в истории: ${past.length}): касаний в среднем ${avg(past.map((p) => p.followUpsDone))} в день, встреч ${avg(past.map((p) => p.meetingsDone))} в день.`,
    left === null ? "До дедлайна: дата не задана." : left >= 0 ? `До дедлайна: ${left} дн.` : `Дедлайн прошёл ${-left} дн. назад.`,
  ];
  return lines.join("\n");
}
