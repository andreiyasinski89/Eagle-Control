import { db } from "@/server/db";
import { dayScore } from "@/modules/crm/day-score";
import { isValidTimeZone, todayIn, zonedToUtc } from "@/modules/views/tz";
import { can } from "@/server/policies";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { NO_TOUCH_DAYS } from "./common";
import { toCard } from "./deals";

const DAY = 86_400_000;

/**
 * "My day": everything that wants the signed-in person's attention, Agile and CRM side by side.
 * Rule-based reminders (no touch for a month, stuck deals, passed close dates) are computed here, at read
 * time; scheduled e-mail delivery needs the background queue that arrives with Phase 4.
 *
 * "Today" is the day in the person's own time zone. Deadlines are dates, so tasks are matched by that date;
 * meetings and calls are instants, so they are matched by the real span of the person's day.
 * `plan` is the day's plan against its fact, and the percentages that come from them (see `dayScore`).
 */
export async function getMyDay(userId: string, workspaceId: string, now = new Date()) {
  const membership = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const me = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const timeZone = me && isValidTimeZone(me.timezone) ? me.timezone : "UTC";
  const localDay = todayIn(timeZone, now);
  // Dates (deadlines) live at midnight UTC of their day.
  const start = new Date(`${localDay}T00:00:00.000Z`);
  const end = new Date(start.getTime() + DAY);
  // Instants (meetings, calls) fall inside the real span of the person's day.
  const nextDay = end.toISOString().slice(0, 10);
  const dayFrom = zonedToUtc(localDay, "00:00", timeZone);
  const dayTo = zonedToUtc(nextDay, "00:00", timeZone);
  const crm = can(membership, "crm:read");

  let reachable: string[] | undefined;
  if (membership.role === "GUEST" || membership.role === "CLIENT") {
    reachable = (await db.projectMember.findMany({ where: { userId }, select: { nodeId: true } })).map((p) => p.nodeId);
  }

  const taskRows = await db.node.findMany({
    where: {
      workspaceId,
      assigneeId: userId,
      archivedAt: null,
      type: { in: ["TASK", "SUBTASK"] },
      status: { notIn: ["DONE", "CANCELLED"] },
      progress: { lt: 100 },
      dueDate: { lt: end },
      ...(reachable ? { rootId: { in: reachable } } : {}),
    },
    orderBy: { dueDate: "asc" },
    take: 100,
    select: { id: true, title: true, type: true, dueDate: true, progress: true, health: true, rootId: true },
  });
  const projects = await db.node.findMany({ where: { id: { in: [...new Set(taskRows.map((t) => t.rootId).filter((x): x is string => !!x))] } }, select: { id: true, title: true } });
  const projectTitle = new Map(projects.map((p) => [p.id, p.title]));
  const tasks = taskRows.map((t) => ({ id: t.id, title: t.title, type: t.type, dueDate: t.dueDate, progress: t.progress, health: t.health, projectId: t.rootId, projectTitle: t.rootId ? (projectTitle.get(t.rootId) ?? null) : null }));

  const todayPrefix = localDay;
  // The span of a day touches two or three UTC dates; ask for those and keep what really starts inside the day.
  const utcDates: string[] = [];
  for (let t = Math.floor(dayFrom.getTime() / DAY) * DAY; t < dayTo.getTime(); t += DAY) utcDates.push(new Date(t).toISOString().slice(0, 10));
  const events = (
    await db.node.findMany({
      where: {
        workspaceId,
        type: "EVENT",
        archivedAt: null,
        AND: [{ OR: utcDates.map((d) => ({ data: { path: ["startsAt"], string_starts_with: d } })) }, { data: { path: ["attendeeIds"], array_contains: [userId] } }],
        ...(reachable ? { rootId: { in: reachable } } : {}),
      },
      select: { id: true, title: true, rootId: true, data: true },
    })
  )
    .map((e) => ({ id: e.id, title: e.title, projectId: e.rootId, startsAt: (e.data as { startsAt?: string }).startsAt ?? null, endsAt: (e.data as { endsAt?: string }).endsAt ?? null, meetingUrl: (e.data as { meetingUrl?: string }).meetingUrl ?? null }))
    .filter((e) => e.startsAt !== null && new Date(e.startsAt) >= dayFrom && new Date(e.startsAt) < dayTo)
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));

  const dueReminders = await db.reminder.findMany({ where: { userId, done: false, remindAt: { lte: now } }, orderBy: { remindAt: "asc" }, take: 50 });
  const reminderNodes = dueReminders.length ? await db.node.findMany({ where: { id: { in: dueReminders.map((r) => r.targetNodeId) } }, select: { id: true, title: true, type: true } }) : [];
  const reminders = dueReminders.map((r) => ({ id: r.id, remindAt: r.remindAt, target: reminderNodes.find((n) => n.id === r.targetNodeId) ?? null }));

  // Plan against fact. Tasks: those due today (finished or not) and those that were due earlier and got finished today.
  const [plannedTaskRows, clearedTaskEvents, tracked] = await Promise.all([
    db.node.findMany({
      where: { workspaceId, assigneeId: userId, archivedAt: null, type: { in: ["TASK", "SUBTASK"] }, status: { not: "CANCELLED" }, dueDate: { gte: start, lt: end }, ...(reachable ? { rootId: { in: reachable } } : {}) },
      select: { status: true, progress: true },
    }),
    db.nodeStatusEvent.findMany({
      where: { toStatus: "DONE", at: { gte: dayFrom, lt: dayTo }, node: { workspaceId, assigneeId: userId, archivedAt: null, dueDate: { lt: start }, ...(reachable ? { rootId: { in: reachable } } : {}) } },
      select: { nodeId: true },
    }),
    db.timeEntry.aggregate({ where: { userId, date: start, node: { workspaceId } }, _sum: { minutes: true } }),
  ]);
  const taskPair = { planned: plannedTaskRows.length, done: plannedTaskRows.filter((r) => r.status === "DONE" || r.progress >= 100).length };
  const nowMs = now.getTime();
  const meetingPair = { planned: events.length, done: events.filter((e) => new Date(e.endsAt ?? (e.startsAt as string)).getTime() <= nowMs).length };
  const finishPlan = (followUps: { planned: number; done: number }, backlogOpen: number, extraCleared: number, extraMeetings: { planned: number; done: number }) => {
    const meetings = { planned: meetingPair.planned + extraMeetings.planned, done: meetingPair.done + extraMeetings.done };
    const counts = { tasks: taskPair, meetings, followUps, backlogOpen: tasks.filter((t) => t.dueDate && t.dueDate < start).length + backlogOpen, backlogCleared: new Set(clearedTaskEvents.map((e) => e.nodeId)).size + extraCleared };
    return { ...counts, trackedMinutes: tracked._sum.minutes ?? 0, ...dayScore(counts) };
  };

  const empty = { crmTasks: [], scheduled: [], dealsNeedingNextStep: [], attention: { staleDeals: [], coldContacts: [] } };
  if (!crm) {
    return { date: todayPrefix, timeZone, tasks: { overdue: tasks.filter((t) => t.dueDate && t.dueDate < start), today: tasks.filter((t) => t.dueDate && t.dueDate >= start) }, events, reminders, crm: false as const, ...empty, plan: finishPlan({ planned: 0, done: 0 }, 0, 0, { planned: 0, done: 0 }), counts: { total: tasks.length + events.length + reminders.length } };
  }

  const actInclude = { contact: { select: { firstName: true, lastName: true } }, company: { select: { legalName: true } }, deal: { select: { node: { select: { title: true } } } } } as const;
  const [crmTasks, scheduled, needNext, openDeals, dayActivities, clearedFollowUps] = await Promise.all([
    db.crmActivity.findMany({ where: { workspaceId, ownerId: userId, type: "TASK", completedAt: null, dueAt: { lt: dayTo } }, orderBy: { dueAt: "asc" }, take: 100, include: actInclude }),
    db.crmActivity.findMany({ where: { workspaceId, ownerId: userId, type: { not: "TASK" }, completedAt: null, dueAt: { gte: dayFrom, lt: dayTo } }, orderBy: { dueAt: "asc" }, take: 50, include: actInclude }),
    db.deal.findMany({
      where: { workspaceId, ownerId: userId, stage: { isWon: false, isLost: false }, node: { archivedAt: null }, OR: [{ nextStep: null }, { nextStep: "" }, { nextStepAt: { lt: end } }] },
      include: { node: { select: { title: true, position: true, createdAt: true } }, stage: true, company: { select: { legalName: true } }, primaryContact: { select: { firstName: true, lastName: true } } },
      take: 100,
    }),
    db.deal.findMany({
      where: { workspaceId, ownerId: userId, stage: { isWon: false, isLost: false }, node: { archivedAt: null } },
      include: { node: { select: { title: true, position: true, createdAt: true } }, stage: true, company: { select: { legalName: true } }, primaryContact: { select: { firstName: true, lastName: true } } },
      take: 300,
    }),
    db.crmActivity.findMany({ where: { workspaceId, ownerId: userId, dueAt: { gte: dayFrom, lt: dayTo } }, select: { type: true, completedAt: true } }),
    db.crmActivity.count({ where: { workspaceId, ownerId: userId, type: "TASK", completedAt: { gte: dayFrom, lt: dayTo }, dueAt: { lt: dayFrom } } }),
  ]);
  const act = (a: (typeof crmTasks)[number]) => ({
    id: a.id,
    type: a.type,
    subject: a.subject,
    dueAt: a.dueAt,
    durationMin: a.durationMin,
    overdue: !!a.dueAt && a.dueAt < dayFrom,
    contactId: a.contactId,
    companyId: a.companyId,
    contactName: a.contact ? [a.contact.firstName, a.contact.lastName].filter(Boolean).join(" ") : null,
    companyName: a.company?.legalName ?? null,
    dealId: a.dealId,
    dealTitle: a.deal?.node.title ?? null,
  });

  const cards = openDeals.map((d) => toCard(d, now));
  const coldBefore = new Date(now.getTime() - NO_TOUCH_DAYS * DAY);
  const contactIds = [...new Set(cards.map((c) => c.contactId).filter((x): x is string => !!x))];
  const cold = contactIds.length
    ? await db.contact.findMany({ where: { nodeId: { in: contactIds }, node: { archivedAt: null }, OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: coldBefore } }] }, select: { nodeId: true, firstName: true, lastName: true, lastContactedAt: true, company: { select: { legalName: true } } }, take: 50 })
    : [];

  const callsAndMeetings = dayActivities.filter((a) => a.type !== "TASK");
  const followUps = dayActivities.filter((a) => a.type === "TASK");
  const plan = finishPlan(
    { planned: followUps.length, done: followUps.filter((a) => a.completedAt).length },
    crmTasks.filter((a) => a.dueAt && a.dueAt < dayFrom).length,
    clearedFollowUps,
    { planned: callsAndMeetings.length, done: callsAndMeetings.filter((a) => a.completedAt).length },
  );

  const result = {
    date: todayPrefix,
    timeZone,
    plan,
    crm: true as const,
    tasks: { overdue: tasks.filter((t) => t.dueDate && t.dueDate < start), today: tasks.filter((t) => t.dueDate && t.dueDate >= start) },
    events,
    reminders,
    crmTasks: crmTasks.map(act),
    scheduled: scheduled.map(act),
    dealsNeedingNextStep: needNext.map((d) => toCard(d, now)),
    attention: {
      staleDeals: cards.filter((c) => c.health === "RED").slice(0, 20),
      coldContacts: cold.map((c) => ({ id: c.nodeId, name: [c.firstName, c.lastName].filter(Boolean).join(" "), companyName: c.company?.legalName ?? null, lastContactedAt: c.lastContactedAt })),
    },
  };
  const total = tasks.length + events.length + reminders.length + result.crmTasks.length + result.scheduled.length + result.dealsNeedingNextStep.length + result.attention.staleDeals.length + result.attention.coldContacts.length;
  return { ...result, counts: { total } };
}
