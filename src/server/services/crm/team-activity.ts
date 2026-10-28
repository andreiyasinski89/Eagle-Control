import { z } from "zod";
import { db } from "@/server/db";
import { activityStatus, countWork, firstLineIds, latest, PERIODS, type ActivityStatus, type WorkCounts } from "@/modules/crm/team-activity";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { fullName } from "./common";
import { contactScope, withScope } from "./scope";

export const teamActivitySchema = z.object({ days: z.coerce.number().refine((n) => (PERIODS as readonly number[]).includes(n), "Choose 7 or 30 days").default(7) });

export interface TeamRow {
  id: string;
  name: string;
  status: ActivityStatus;
  lastAt: Date | null;
  counts: WorkCounts;
  /** Partners below this one: the size of their line. */
  below: number;
}
export interface InviteeRow {
  id: string;
  name: string;
  joinedAt: Date | null;
  /** False until the person agrees to show a summary; then the numbers and the last action are filled in. */
  shared: boolean;
  status: ActivityStatus;
  lastAt: Date | null;
  counts: WorkCounts | null;
}

/**
 * How the people directly below you are doing over the last 7 or 30 days, counted from what happened.
 * Two groups: the partners of the first line in your own CRM (what the people they work with moved through), and the people who came
 * through your platform link, whose workspaces are their own: for them you get numbers only, and only if they agreed to share them.
 */
export async function getTeamActivity(userId: string, workspaceId: string, f: z.infer<typeof teamActivitySchema>, now = new Date()) {
  const member = await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const scope = await contactScope(db, member);
  const since = new Date(now.getTime() - f.days * 86_400_000);
  const inPeriod = { gte: since, lte: now };

  // The first line of partners in this workspace.
  const people = await db.contact.findMany({
    where: withScope({ workspaceId, node: { archivedAt: null }, stage: { in: ["PARTNER"] } }, scope),
    select: { nodeId: true, firstName: true, lastName: true, stage: true, sponsorId: true, linkedUserId: true, ownerId: true },
  });
  const selfId = people.find((p) => p.linkedUserId === userId && p.ownerId === userId)?.nodeId ?? null;
  const lineIds = firstLineIds(people.map((p) => ({ id: p.nodeId, stage: p.stage, sponsorId: p.sponsorId })), selfId);
  const line = people.filter((p) => lineIds.includes(p.nodeId));

  const [events, acts, held, below] = line.length
    ? await Promise.all([
        db.contactStageEvent.findMany({ where: { workspaceId, at: inPeriod, contact: { heldById: { in: lineIds } } }, select: { fromStage: true, toStage: true, at: true, contact: { select: { heldById: true } } } }),
        db.crmActivity.findMany({ where: { workspaceId, completedAt: inPeriod, contact: { heldById: { in: lineIds } } }, select: { type: true, completedAt: true, contact: { select: { heldById: true } } } }),
        db.contact.findMany({ where: { workspaceId, heldById: { in: lineIds }, lastContactedAt: { not: null } }, select: { heldById: true, lastContactedAt: true } }),
        db.contact.findMany({ where: { workspaceId, stage: "PARTNER", node: { archivedAt: null }, sponsorId: { not: null } }, select: { nodeId: true, sponsorId: true } }),
      ])
    : [[], [], [], []];
  // Their own sign of work in this workspace, when they have an account in it.
  // The last sign of work does not depend on the period: the most recent move or finished call of the people each partner works with.
  const lastSeen = new Map<string, Date | null>();
  await Promise.all(
    lineIds.map(async (id) => {
      const [e, a] = await Promise.all([
        db.contactStageEvent.findFirst({ where: { workspaceId, contact: { heldById: id } }, orderBy: { at: "desc" }, select: { at: true } }),
        db.crmActivity.findFirst({ where: { workspaceId, completedAt: { not: null }, contact: { heldById: id } }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
      ]);
      lastSeen.set(id, latest(e?.at, a?.completedAt));
    }),
  );
  const accountIds = line.map((p) => p.linkedUserId).filter((x): x is string => !!x);
  const logs = accountIds.length ? await db.activityLog.groupBy({ by: ["actorId"], where: { workspaceId, actorId: { in: accountIds } }, _max: { createdAt: true } }) : [];
  const lastLog = new Map(logs.map((l) => [l.actorId, l._max.createdAt]));
  const sponsoring = new Map<string, number>();
  for (const b of below) if (b.sponsorId) sponsoring.set(b.sponsorId, (sponsoring.get(b.sponsorId) ?? 0) + 1);

  const partners: TeamRow[] = line
    .map((p) => {
      const ev = events.filter((e) => e.contact.heldById === p.nodeId);
      const ac = acts.filter((a) => a.contact?.heldById === p.nodeId);
      const lastAt = latest(lastSeen.get(p.nodeId), ...held.filter((h) => h.heldById === p.nodeId).map((h) => h.lastContactedAt), p.linkedUserId ? lastLog.get(p.linkedUserId) : null);
      return { id: p.nodeId, name: fullName(p.firstName, p.lastName), status: activityStatus(lastAt, now), lastAt, counts: countWork(ev, ac), below: sponsoring.get(p.nodeId) ?? 0 };
    })
    .sort((a, b) => (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0) || a.name.localeCompare(b.name));

  // People who came through your platform link. Their work is theirs: numbers only, and only with their agreement.
  const invited = await db.user.findMany({ where: { referredById: userId, deletedAt: null }, orderBy: { referredAt: "asc" }, select: { id: true, name: true, email: true, referredAt: true, shareActivity: true } });
  const sharing = invited.filter((u) => u.shareActivity).map((u) => u.id);
  const [iEvents, iActs, iLogs] = sharing.length
    ? await Promise.all([
        db.contactStageEvent.findMany({ where: { actorId: { in: sharing }, at: inPeriod }, select: { actorId: true, fromStage: true, toStage: true } }),
        db.crmActivity.findMany({ where: { ownerId: { in: sharing }, completedAt: inPeriod }, select: { ownerId: true, type: true } }),
        db.activityLog.groupBy({ by: ["actorId"], where: { actorId: { in: sharing } }, _max: { createdAt: true } }),
      ])
    : [[], [], []];
  const iLast = new Map(iLogs.map((l) => [l.actorId, l._max.createdAt]));
  const invitees: InviteeRow[] = invited.map((u) => {
    const name = u.name?.trim() || u.email.split("@")[0] || u.email;
    if (!u.shareActivity) return { id: u.id, name, joinedAt: u.referredAt, shared: false, status: "never", lastAt: null, counts: null };
    const lastAt = iLast.get(u.id) ?? null;
    return { id: u.id, name, joinedAt: u.referredAt, shared: true, status: activityStatus(lastAt, now), lastAt, counts: countWork(iEvents.filter((e) => e.actorId === u.id), iActs.filter((a) => a.ownerId === u.id)) };
  });

  const slow = (r: { status: ActivityStatus }) => r.status === "quiet" || r.status === "gone";
  return { days: f.days, now, partners, invitees, totals: { partners: partners.length, invitees: invitees.length, quiet: partners.filter(slow).length + invitees.filter((r) => r.shared && slow(r)).length } };
}

/** The person's own choice to let whoever invited them see a summary of their activity (numbers only). */
export async function getSharing(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { shareActivity: true, referredBy: { select: { id: true, name: true, email: true } } } });
  const sponsor = u?.referredBy ? { name: u.referredBy.name?.trim() || u.referredBy.email.split("@")[0] || u.referredBy.email } : null;
  return { sponsor, share: !!u?.shareActivity };
}

export const sharingSchema = z.object({ share: z.boolean() });
export async function setSharing(userId: string, share: boolean) {
  await db.user.update({ where: { id: userId }, data: { shareActivity: share } });
  return getSharing(userId);
}
