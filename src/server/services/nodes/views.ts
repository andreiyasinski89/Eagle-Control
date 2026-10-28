import { z } from "zod";
import { db } from "@/server/db";
import { ApiError, notFound } from "@/server/http/errors";
import { can } from "@/server/policies";
import { nodePath } from "@/server/services/links";
import { occurrences, type Repeat } from "@/modules/nodes/repeat";
import { loadNode, loadWorkspaceMember } from "./access";
import { contactScope } from "@/server/services/crm/scope";

const DAY = 86_400_000;

/** Dependencies between work items of one project (the timeline draws them as arrows). */
export async function projectBlockLinks(userId: string, projectId: string) {
  const { node } = await loadNode(db, userId, projectId);
  if (node.type !== "PROJECT") throw notFound("project");
  const rows = await db.nodeLink.findMany({
    where: { kind: "BLOCKS", from: { rootId: projectId, archivedAt: null }, to: { rootId: projectId, archivedAt: null } },
    select: { id: true, fromNodeId: true, toNodeId: true },
  });
  return { items: rows };
}

export const calendarQuerySchema = z
  .object({ from: z.string().date(), to: z.string().date(), mine: z.enum(["0", "1"]).default("0") })
  .refine((q) => q.from <= q.to, "from must not be after to")
  .refine((q) => new Date(q.to).getTime() - new Date(q.from).getTime() <= 62 * DAY, "Ask for at most about two months");

export type CalendarKind = "task" | "milestone" | "event" | "crm_activity" | "deal_step" | "deal_close";

export interface CalendarItem {
  id: string;
  kind: CalendarKind;
  title: string;
  /** ISO timestamp; all-day items are midnight UTC. */
  at: string;
  endAt: string | null;
  done: boolean;
  /** Workspace-relative link (`/projects/p/…`); the UI prefixes `/w/<slug>`. */
  href: string;
  context: string | null;
  /** Set on a date of a repeating event: the event's own id, since `id` then carries the date as well. */
  seriesId?: string;
}

/**
 * Everything dated inside a window, Agile and CRM side by side: task and sprint due dates, events, CRM activities,
 * deals' next steps and expected close dates. Guests and clients only see projects they were added to; CRM items need CRM access.
 */
export async function workspaceCalendar(userId: string, workspaceId: string, q: z.infer<typeof calendarQuerySchema>): Promise<{ items: CalendarItem[] }> {
  const membership = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const from = new Date(`${q.from}T00:00:00.000Z`);
  const to = new Date(new Date(`${q.to}T00:00:00.000Z`).getTime() + DAY); // inclusive end day
  const mine = q.mine === "1";

  let reachable: string[] | undefined;
  if (membership.role === "GUEST" || membership.role === "CLIENT") {
    reachable = (await db.projectMember.findMany({ where: { userId }, select: { nodeId: true } })).map((p) => p.nodeId);
  }
  const scope = reachable ? { rootId: { in: reachable } } : {};

  const [dated, eventRows] = await Promise.all([
    db.node.findMany({
      where: { workspaceId, archivedAt: null, type: { in: ["TASK", "SUBTASK", "SPRINT", "EPIC"] }, dueDate: { gte: from, lt: to }, ...(mine ? { assigneeId: userId } : {}), ...scope, ...(membership.role === "CLIENT" ? { visibleToClient: true } : {}) },
      orderBy: { dueDate: "asc" },
      take: 500,
      select: { id: true, type: true, title: true, status: true, dueDate: true, rootId: true },
    }),
    db.node.findMany({ where: { workspaceId, archivedAt: null, type: "EVENT", ...scope, ...(membership.role === "CLIENT" ? { visibleToClient: true } : {}) }, take: 1000, select: { id: true, title: true, rootId: true, data: true } }),
  ]);

  const projectIds = [...new Set([...dated, ...eventRows].map((n) => n.rootId).filter((x): x is string => !!x))];
  const projects = projectIds.length ? await db.node.findMany({ where: { id: { in: projectIds } }, select: { id: true, title: true } }) : [];
  const projectTitle = new Map(projects.map((p) => [p.id, p.title]));

  const items: CalendarItem[] = dated.map((n) => ({
    id: n.id,
    kind: n.type === "TASK" || n.type === "SUBTASK" ? "task" : "milestone",
    title: n.title,
    at: (n.dueDate as Date).toISOString(),
    endAt: null,
    done: n.status === "DONE" || n.status === "CANCELLED",
    href: nodePath(n),
    context: n.rootId ? (projectTitle.get(n.rootId) ?? null) : null,
  }));

  for (const e of eventRows) {
    const d = e.data as { startsAt?: string; endsAt?: string; attendeeIds?: string[]; repeat?: Repeat };
    if (!d.startsAt || Number.isNaN(new Date(d.startsAt).getTime())) continue;
    if (mine && !d.attendeeIds?.includes(userId)) continue;
    const context = e.rootId ? (projectTitle.get(e.rootId) ?? null) : null;
    const href = nodePath({ id: e.id, type: "EVENT", rootId: e.rootId });
    // A repeating event is one node; its dates inside the window are worked out here, so the calendar shows each of them.
    for (const o of occurrences({ startsAt: d.startsAt, endsAt: d.endsAt, repeat: d.repeat }, from, to)) {
      items.push({
        id: d.repeat ? `${e.id}@${o.day}` : e.id,
        kind: "event",
        title: e.title,
        at: o.start.toISOString(),
        endAt: o.end ? o.end.toISOString() : null,
        done: false,
        href,
        context,
        ...(d.repeat ? { seriesId: e.id } : {}),
      });
    }
  }

  if (can(membership, "crm:read")) {
    // An activity belongs to a person, a company or a deal: the person's own always show, those of a person one may see show, and the
    // ones about companies and deals only for whoever sees the whole CRM. Deals are for the whole-CRM level only.
    const scope = await contactScope(db, membership);
    const full = can(membership, "crm:full");
    const visible = scope ? { OR: [{ ownerId: userId }, { contact: { is: scope } }, ...(full ? [{ contactId: null }] : [])] } : {};
    const [acts, deals] = await Promise.all([
      db.crmActivity.findMany({
        where: { AND: [{ workspaceId, dueAt: { gte: from, lt: to }, ...(mine ? { ownerId: userId } : {}) }, visible] },
        take: 500,
        include: { deal: { select: { node: { select: { title: true } } } }, company: { select: { legalName: true } } },
      }),
      db.deal.findMany({
        where: { workspaceId, node: { archivedAt: null }, stage: { isWon: false, isLost: false }, ...(mine ? { ownerId: userId } : {}), ...(full ? {} : { nodeId: { in: [] } }), OR: [{ nextStepAt: { gte: from, lt: to } }, { expectedCloseDate: { gte: from, lt: to } }] },
        take: 500,
        select: { nodeId: true, nextStep: true, nextStepAt: true, expectedCloseDate: true, node: { select: { title: true, id: true, type: true, rootId: true } }, company: { select: { legalName: true } } },
      }),
    ]);
    for (const a of acts) {
      items.push({ id: a.id, kind: "crm_activity", title: a.subject, at: (a.dueAt as Date).toISOString(), endAt: a.durationMin ? new Date((a.dueAt as Date).getTime() + a.durationMin * 60_000).toISOString() : null, done: a.completedAt !== null, href: a.dealId ? `/crm?deal=${a.dealId}` : a.contactId ? `/crm/contacts?contact=${a.contactId}` : a.companyId ? `/crm/companies/${a.companyId}` : "/crm/activities", context: a.deal?.node.title ?? a.company?.legalName ?? null });
    }
    for (const d of deals) {
      const href = nodePath(d.node);
      if (d.nextStepAt && d.nextStepAt >= from && d.nextStepAt < to) items.push({ id: `${d.nodeId}:step`, kind: "deal_step", title: d.nextStep || d.node.title, at: d.nextStepAt.toISOString(), endAt: null, done: false, href, context: d.node.title });
      if (d.expectedCloseDate && d.expectedCloseDate >= from && d.expectedCloseDate < to) items.push({ id: `${d.nodeId}:close`, kind: "deal_close", title: d.node.title, at: d.expectedCloseDate.toISOString(), endAt: null, done: false, href, context: d.company?.legalName ?? null });
    }
  }

  items.sort((a, b) => a.at.localeCompare(b.at) || a.title.localeCompare(b.title));
  if (items.length > 2000) throw new ApiError(422, "too_many", "Too many items; narrow the window");
  return { items };
}
