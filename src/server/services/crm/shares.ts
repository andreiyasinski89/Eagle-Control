import { z } from "zod";
import type { Membership } from "@prisma/client";
import { db } from "@/server/db";
import { crmLevel } from "@/modules/crm/access";
import { forbidden, notFound } from "@/server/http/errors";
import { can } from "@/server/policies";
import { loadWorkspaceMember, logActivity, type Tx } from "@/server/services/nodes/access";
import { invalid, loadCrmNode } from "./common";
import { contactVisible } from "./scope";

export const shareSchema = z
  .object({ userId: z.string().optional(), teamId: z.string().optional(), level: z.enum(["VIEW", "EDIT"]).default("VIEW") })
  .refine((v) => (v.userId ? 1 : 0) + (v.teamId ? 1 : 0) === 1, "Give the access to one member or to one team");

type ShareInput = z.infer<typeof shareSchema>;
type Object_ = { contactId: string; groupId?: undefined } | { groupId: string; contactId?: undefined };

/** Who may give and take away access to one person: those who see the whole CRM, and the person's owner (who can change them). */
async function assertCanManageContact(tx: Tx, m: Membership, contactId: string): Promise<void> {
  if (can(m, "crm:full")) return;
  const c = await tx.contact.findUniqueOrThrow({ where: { nodeId: contactId }, select: { ownerId: true } });
  if (c.ownerId !== m.userId || !can(m, "crm:write") || !(await contactVisible(tx, m, contactId, { write: true }))) throw forbidden();
}

async function describe(tx: Tx, workspaceId: string, rows: { id: string; userId: string | null; teamId: string | null; level: "VIEW" | "EDIT"; createdAt: Date }[]) {
  const users = await tx.user.findMany({ where: { id: { in: rows.map((r) => r.userId).filter((x): x is string => !!x) } }, select: { id: true, name: true, email: true } });
  const teams = await tx.team.findMany({ where: { workspaceId, id: { in: rows.map((r) => r.teamId).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const uName = new Map(users.map((u) => [u.id, u.name ?? u.email]));
  const tName = new Map(teams.map((x) => [x.id, x.name]));
  return rows.map((r) => ({ id: r.id, kind: r.userId ? ("user" as const) : ("team" as const), granteeId: (r.userId ?? r.teamId) as string, name: (r.userId ? uName.get(r.userId) : r.teamId ? tName.get(r.teamId) : null) ?? "", level: r.level, createdAt: r.createdAt }));
}

/** The members and teams a share can be given to: members who see part of the CRM (those who see all need no share, those with none could not open it). */
async function candidates(tx: Tx, workspaceId: string, selfId: string) {
  const members = await tx.membership.findMany({ where: { workspaceId, role: "MEMBER", userId: { not: selfId } }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } });
  const teams = await tx.team.findMany({ where: { workspaceId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return {
    users: members.filter((m) => ["OWN", "TEAM"].includes(crmLevel(m))).map((m) => ({ id: m.userId, name: m.user.name ?? m.user.email })),
    teams,
  };
}

async function assertGrantee(tx: Tx, workspaceId: string, granterId: string, input: ShareInput): Promise<void> {
  if (input.teamId) {
    const team = await tx.team.findUnique({ where: { id: input.teamId }, select: { workspaceId: true } });
    if (!team || team.workspaceId !== workspaceId) throw invalid("invalid_grantee", "Team not found in this workspace");
    return;
  }
  if (input.userId === granterId) throw invalid("self_share", "Access is given to somebody else");
  const m = await tx.membership.findUnique({ where: { userId_workspaceId: { userId: input.userId as string, workspaceId } } });
  if (!m || m.role === "CLIENT" || m.role === "GUEST") throw invalid("invalid_grantee", "The person must be a member of this workspace");
  const level = crmLevel(m);
  if (level === "ALL") throw invalid("already_sees_all", "This member already sees everything");
  if (level === "NONE") throw invalid("grantee_no_crm", "Give this member access to the CRM first (Settings → Members)");
}

async function upsertShare(tx: Tx, workspaceId: string, granterId: string, obj: Object_, input: ShareInput) {
  const where = { workspaceId, ...(obj.contactId ? { contactId: obj.contactId } : { groupId: obj.groupId }), ...(input.userId ? { userId: input.userId } : { teamId: input.teamId }) };
  const cur = await tx.contactShare.findFirst({ where });
  if (cur) return cur.level === input.level ? cur : tx.contactShare.update({ where: { id: cur.id }, data: { level: input.level, grantedById: granterId } });
  return tx.contactShare.create({ data: { ...where, level: input.level, grantedById: granterId } });
}

// ── One person ─────────────────────────────────────────────────────────────

export async function listContactShares(userId: string, contactId: string) {
  return db.$transaction(async (tx) => {
    const node = await loadCrmNode(tx, userId, contactId, "CONTACT");
    const m = await loadWorkspaceMember(tx, userId, node.workspaceId, "crm:read");
    await assertCanManageContact(tx, m, contactId);
    const rows = await tx.contactShare.findMany({ where: { contactId }, orderBy: { createdAt: "asc" } });
    return { items: await describe(tx, node.workspaceId, rows), candidates: await candidates(tx, node.workspaceId, userId) };
  });
}

export async function grantContactShare(userId: string, contactId: string, input: ShareInput) {
  return db.$transaction(async (tx) => {
    const node = await loadCrmNode(tx, userId, contactId, "CONTACT");
    const m = await loadWorkspaceMember(tx, userId, node.workspaceId, "crm:read");
    await assertCanManageContact(tx, m, contactId);
    await assertGrantee(tx, node.workspaceId, userId, input);
    const s = await upsertShare(tx, node.workspaceId, userId, { contactId }, input);
    await logActivity(tx, { workspaceId: node.workspaceId, nodeId: contactId, actorId: userId, action: "contact.shared", diff: { to: input.userId ?? input.teamId ?? null, kind: input.userId ? "user" : "team", level: input.level } });
    return { id: s.id };
  });
}

// ── A group of people ──────────────────────────────────────────────────────

async function loadGroupForShare(tx: Tx, userId: string, groupId: string) {
  const g = await tx.contactGroup.findUnique({ where: { id: groupId } });
  if (!g) throw notFound("group");
  const m = await tx.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId: g.workspaceId } } });
  if (!m) throw notFound("group");
  if (!can(m, "crm:full")) throw forbidden();
  return g;
}

export async function listGroupShares(userId: string, groupId: string) {
  return db.$transaction(async (tx) => {
    const g = await loadGroupForShare(tx, userId, groupId);
    const rows = await tx.contactShare.findMany({ where: { groupId }, orderBy: { createdAt: "asc" } });
    return { items: await describe(tx, g.workspaceId, rows), candidates: await candidates(tx, g.workspaceId, userId) };
  });
}

export async function grantGroupShare(userId: string, groupId: string, input: ShareInput) {
  return db.$transaction(async (tx) => {
    const g = await loadGroupForShare(tx, userId, groupId);
    await assertGrantee(tx, g.workspaceId, userId, input);
    const s = await upsertShare(tx, g.workspaceId, userId, { groupId }, input);
    await logActivity(tx, { workspaceId: g.workspaceId, nodeId: null, actorId: userId, action: "contact_group.shared", diff: { group: g.name, to: input.userId ?? input.teamId ?? null, kind: input.userId ? "user" : "team", level: input.level } });
    return { id: s.id };
  });
}

// ── Taking access away ─────────────────────────────────────────────────────

export async function revokeShare(userId: string, shareId: string) {
  return db.$transaction(async (tx) => {
    const s = await tx.contactShare.findUnique({ where: { id: shareId } });
    if (!s) throw notFound("share");
    const m = await tx.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId: s.workspaceId } } });
    if (!m || !can(m, "crm:read")) throw notFound("share");
    if (s.contactId) {
      if (!(await contactVisible(tx, m, s.contactId))) throw notFound("share");
      await assertCanManageContact(tx, m, s.contactId);
    } else if (!can(m, "crm:full")) throw forbidden();
    await tx.contactShare.delete({ where: { id: shareId } });
    await logActivity(tx, { workspaceId: s.workspaceId, nodeId: s.contactId, actorId: userId, action: s.contactId ? "contact.unshared" : "contact_group.unshared", diff: { to: s.userId ?? s.teamId ?? null, kind: s.userId ? "user" : "team", ...(s.groupId ? { groupId: s.groupId } : {}) } });
    return { revoked: true };
  });
}
