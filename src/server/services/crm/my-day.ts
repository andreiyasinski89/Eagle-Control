import { db } from "@/server/db";
import { can } from "@/server/policies";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { NO_TOUCH_DAYS } from "./common";
import { toCard } from "./deals";

const DAY = 86_400_000;

/**
 * "My day": everything that wants the signed-in person's attention, Agile and CRM side by side.
 * Rule-based reminders (no touch for a month, stuck deals, passed close dates) are computed here, at read
 * time; scheduled e-mail delivery needs the background queue that arrives with Phase 4.
 */
export async function getMyDay(userId: string, workspaceId: string, now = new Date()) {
  const membership = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const start = new Date(Math.floor(now.getTime() / DAY) * DAY);
  const end = new Date(start.getTime() + DAY);
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

  const todayPrefix = start.toISOString().slice(0, 10);
  const events = (
    await db.node.findMany({
      where: {
        workspaceId,
        type: "EVENT",
        archivedAt: null,
        AND: [{ data: { path: ["startsAt"], string_starts_with: todayPrefix } }, { data: { path: ["attendeeIds"], array_contains: [userId] } }],
        ...(reachable ? { rootId: { in: reachable } } : {}),
      },
      select: { id: true, title: true, rootId: true, data: true },
    })
  )
    .map((e) => ({ id: e.id, title: e.title, projectId: e.rootId, startsAt: (e.data as { startsAt?: string }).startsAt ?? null, meetingUrl: (e.data as { meetingUrl?: string }).meetingUrl ?? null }))
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));

  const dueReminders = await db.reminder.findMany({ where: { userId, done: false, remindAt: { lte: now } }, orderBy: { remindAt: "asc" }, take: 50 });
  const reminderNodes = dueReminders.length ? await db.node.findMany({ where: { id: { in: dueReminders.map((r) => r.targetNodeId) } }, select: { id: true, title: true, type: true } }) : [];
  const reminders = dueReminders.map((r) => ({ id: r.id, remindAt: r.remindAt, target: reminderNodes.find((n) => n.id === r.targetNodeId) ?? null }));

  const empty = { crmTasks: [], scheduled: [], dealsNeedingNextStep: [], attention: { staleDeals: [], coldContacts: [] } };
  if (!crm) {
    return { date: todayPrefix, tasks: { overdue: tasks.filter((t) => t.dueDate && t.dueDate < start), today: tasks.filter((t) => t.dueDate && t.dueDate >= start) }, events, reminders, crm: false as const, ...empty, counts: { total: tasks.length + events.length + reminders.length } };
  }

  const actInclude = { contact: { select: { firstName: true, lastName: true } }, company: { select: { legalName: true } }, deal: { select: { node: { select: { title: true } } } } } as const;
  const [crmTasks, scheduled, needNext, openDeals] = await Promise.all([
    db.crmActivity.findMany({ where: { workspaceId, ownerId: userId, type: "TASK", completedAt: null, dueAt: { lt: end } }, orderBy: { dueAt: "asc" }, take: 100, include: actInclude }),
    db.crmActivity.findMany({ where: { workspaceId, ownerId: userId, type: { not: "TASK" }, completedAt: null, dueAt: { gte: start, lt: end } }, orderBy: { dueAt: "asc" }, take: 50, include: actInclude }),
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
  ]);
  const act = (a: (typeof crmTasks)[number]) => ({
    id: a.id,
    type: a.type,
    subject: a.subject,
    dueAt: a.dueAt,
    overdue: !!a.dueAt && a.dueAt < start,
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

  const result = {
    date: todayPrefix,
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
