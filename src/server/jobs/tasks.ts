import { db } from "@/server/db";
import { getMyDay } from "@/server/services/crm/my-day";
import { announceToSlack } from "@/server/integrations/slack";
import { notify } from "@/server/services/notify";
import { syncGrantedPlans } from "@/server/services/grants";
import { recomputeProject } from "@/server/services/nodes/recompute";

/**
 * The work of every background job lives here as plain functions: Inngest only decides *when* they run.
 * That keeps them testable on a real database and lets `JOBS_MODE=inline` run them in-process.
 */

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const isoWeek = (d: Date) => `${d.getUTCFullYear()}-W${Math.ceil(((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY + 1) / 7)}`;

/**
 * Health depends on "today", so stored values drift overnight. This recomputes progress and health of every
 * active project and tells owners and admins when one has just turned red.
 */
export async function refreshAllProjects(now = new Date()): Promise<{ projects: number; turnedRed: number }> {
  const projects = await db.node.findMany({ where: { type: "PROJECT", archivedAt: null }, select: { id: true, title: true, workspaceId: true, health: true } });
  let turnedRed = 0;
  for (const p of projects) {
    await db.$transaction((tx) => recomputeProject(tx, p.id, now), { timeout: 60_000 });
    const after = await db.node.findUniqueOrThrow({ where: { id: p.id }, select: { health: true } });
    if (after.health === "RED" && p.health !== "RED") {
      turnedRed++;
      const people = await db.membership.findMany({ where: { workspaceId: p.workspaceId, role: { in: ["OWNER", "ADMIN"] } }, select: { userId: true } });
      let first = true;
      for (const m of people) {
        const id = await notify({ userId: m.userId, workspaceId: p.workspaceId, kind: "project_red", title: `Project “${p.title}” turned red`, url: `/projects/p/${p.id}`, dedupeKey: `project_red:${p.id}:${isoDay(now)}`, payload: { projectId: p.id } });
        if (id && first) {
          first = false; // the first new notification of the day also goes to the team channel, once
          await announceToSlack(p.workspaceId, "project_red", { title: `Project “${p.title}” turned red`, url: `/projects/p/${p.id}` });
        }
      }
    }
  }
  return { projects: projects.length, turnedRed };
}

/**
 * Sprints whose due date passed in the last three days: tells the project's owners and admins how it ended, once per sprint
 * (the notification's dedupe key is also what keeps the Slack message from repeating).
 */
export async function announceEndedSprints(now = new Date()): Promise<{ sprints: number }> {
  const today = new Date(Math.floor(now.getTime() / DAY) * DAY);
  const sprints = await db.node.findMany({
    where: { type: "SPRINT", archivedAt: null, dueDate: { lt: today, gte: new Date(today.getTime() - 3 * DAY) } },
    select: { id: true, title: true, workspaceId: true, rootId: true },
  });
  let announced = 0;
  for (const s of sprints) {
    const tasks = await db.node.findMany({ where: { parentId: s.id, type: "TASK", archivedAt: null }, select: { status: true } });
    if (tasks.length === 0) continue;
    const done = tasks.filter((t) => t.status === "DONE").length;
    const project = s.rootId ? await db.node.findUnique({ where: { id: s.rootId }, select: { title: true } }) : null;
    const title = `Sprint ended: ${s.title}${project ? ` (${project.title})` : ""}`;
    const body = `${done} of ${tasks.length} tasks done`;
    const people = await db.membership.findMany({ where: { workspaceId: s.workspaceId, role: { in: ["OWNER", "ADMIN"] } }, select: { userId: true } });
    let first = true;
    for (const m of people) {
      const id = await notify({ userId: m.userId, workspaceId: s.workspaceId, kind: "sprint_ended", title, body, url: `/projects/p/${s.rootId ?? s.id}?node=${s.id}`, dedupeKey: `sprint_ended:${s.id}`, payload: { sprintId: s.id, done, total: tasks.length } });
      if (id && first) {
        first = false;
        announced++;
        await announceToSlack(s.workspaceId, "sprint_ended", { title, body, url: `/projects/p/${s.rootId ?? s.id}?node=${s.id}` });
      }
    }
  }
  return { sprints: announced };
}

/**
 * Manual reminders that came due, plus the rule-based ones (no touch for a month, deals going cold). Each
 * rule notifies about a given contact or deal at most once a week; a manual reminder fires once.
 */
export async function dispatchReminders(now = new Date()): Promise<{ manual: number; automatic: number }> {
  let manual = 0;
  let automatic = 0;

  const due = await db.reminder.findMany({ where: { done: false, remindAt: { lte: now } }, take: 500 });
  for (const r of due) {
    const target = await db.node.findUnique({ where: { id: r.targetNodeId }, select: { title: true, workspaceId: true, type: true, rootId: true, id: true } });
    if (target) {
      const path = target.type === "PROJECT" || target.rootId ? `/projects/p/${target.rootId ?? target.id}?node=${target.id}` : target.type === "DEAL" ? `/crm?deal=${target.id}` : `/crm/contacts?contact=${target.id}`;
      await notify({ userId: r.userId, workspaceId: target.workspaceId, kind: "reminder", title: `Reminder: ${target.title}`, url: path, dedupeKey: `reminder:${r.id}`, extraChannels: r.channel === "EMAIL" ? ["email"] : [] });
    }
    await db.reminder.update({ where: { id: r.id }, data: { done: true } });
    manual++;
  }

  const members = await db.membership.findMany({ where: { role: { in: ["OWNER", "ADMIN", "MEMBER"] } }, select: { userId: true, workspaceId: true } });
  for (const m of members) {
    const day = await getMyDay(m.userId, m.workspaceId, now).catch(() => null);
    if (!day || !day.crm) continue;
    for (const d of day.attention.staleDeals) {
      const id = await notify({ userId: m.userId, workspaceId: m.workspaceId, kind: "stale_deal", title: `“${d.title}” is going cold`, body: d.companyName ?? undefined, url: `/crm?deal=${d.id}`, dedupeKey: `stale:${d.id}:${isoWeek(now)}` });
      if (id) automatic++;
    }
    for (const c of day.attention.coldContacts) {
      const id = await notify({ userId: m.userId, workspaceId: m.workspaceId, kind: "cold_contact", title: `No contact with ${c.name} for a month`, body: c.companyName ?? undefined, url: `/crm/contacts?contact=${c.id}`, dedupeKey: `cold:${c.id}:${isoWeek(now)}` });
      if (id) automatic++;
    }
  }
  return { manual, automatic };
}

/** Housekeeping: lead submissions keep personal data, so they are not kept forever. */
export async function maintenance(now = new Date()): Promise<Record<string, number>> {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const [leads, sessions, tokens, invites, read, attempts, granted] = await Promise.all([
    db.leadIngest.deleteMany({ where: { createdAt: { lt: ago(90) } } }),
    db.session.deleteMany({ where: { expires: { lt: now } } }),
    db.verificationToken.deleteMany({ where: { expires: { lt: now } } }),
    db.invitation.updateMany({ where: { status: "PENDING", expiresAt: { lt: now } }, data: { status: "EXPIRED" } }),
    db.notification.deleteMany({ where: { readAt: { lt: ago(180) } } }),
    db.signInAttempt.deleteMany({ where: { at: { lt: ago(2) } } }),
    syncGrantedPlans(),
  ]);
  return { leadSubmissions: leads.count, sessions: sessions.count, verificationTokens: tokens.count, invitations: invites.count, notifications: read.count, signInAttempts: attempts.count, grantedPlans: granted.granted };
}
