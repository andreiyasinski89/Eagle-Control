import { z } from "zod";
import type { Plan, Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { CRM_LEVELS, crmLevel, levelFields } from "@/modules/crm/access";
import { db } from "@/server/db";
import { ApiError, forbidden, notFound } from "@/server/http/errors";
import { deletionStatus, eraseAccount } from "./account";
import { recomputePlans, syncPlan } from "./entitlements";
import { paidMode } from "./paid-plans";

/** The platform owner(s): the addresses in SUPERADMIN_EMAILS, lower-cased. Nobody else may open the admin. */
export function superAdminEmails(): string[] {
  return (env().SUPERADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}
export const isSuperAdminEmail = (email: string | null | undefined): boolean => !!email && superAdminEmails().includes(email.trim().toLowerCase());

/** The caller is the platform owner, or the thing does not exist for them (404, so the admin is not even discoverable). */
export async function requireSuperAdmin(userId: string): Promise<{ id: string; email: string }> {
  const u = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, deletedAt: true } });
  if (!u || u.deletedAt || !isSuperAdminEmail(u.email)) throw notFound();
  return u;
}

const log = (actorId: string, action: string, targetUserId: string | null, data: Prisma.InputJsonValue = {}) => db.adminLog.create({ data: { actorId, action, targetUserId, data } });

export const listUsersSchema = z.object({ q: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });

/** Everyone who has an account, newest first: how they came, what they own, how many points they have. */
export async function listUsers(actorId: string, f: z.infer<typeof listUsersSchema>) {
  await requireSuperAdmin(actorId);
  const where: Prisma.UserWhereInput = { deletedAt: null, ...(f.q ? { OR: [{ email: { contains: f.q, mode: "insensitive" } }, { name: { contains: f.q, mode: "insensitive" } }] } : {}) };
  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (f.page - 1) * f.pageSize,
      take: f.pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        suspendedAt: true,
        referredBy: { select: { id: true, name: true, email: true } },
        _count: { select: { invited: true } },
        memberships: { where: { role: "OWNER" }, select: { workspace: { select: { id: true, name: true, plan: true } } } },
      },
    }),
  ]);
  const points = rows.length ? await db.bonusPoint.groupBy({ by: ["userId"], where: { userId: { in: rows.map((r) => r.id) } }, _sum: { points: true } }) : [];
  const pts = new Map(points.map((p) => [p.userId, p._sum.points ?? 0]));
  return {
    mode: paidMode(),
    total,
    page: f.page,
    pageSize: f.pageSize,
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      createdAt: r.createdAt,
      suspended: !!r.suspendedAt,
      isSuperAdmin: isSuperAdminEmail(r.email),
      invitedBy: r.referredBy ? (r.referredBy.name ?? r.referredBy.email) : null,
      invitedCount: r._count.invited,
      points: pts.get(r.id) ?? 0,
      workspaces: r.memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name, plan: m.workspace.plan })),
    })),
  };
}

/** One person in full: their registration data, every workspace they belong to with their role and access, who they invited and the points. */
export async function getUserDetail(actorId: string, userId: string) {
  await requireSuperAdmin(actorId);
  const u = await db.user.findUnique({
    where: { id: userId },
    include: {
      referredBy: { select: { id: true, name: true, email: true } },
      invited: { where: { deletedAt: null }, orderBy: { referredAt: "desc" }, select: { id: true, name: true, email: true, referredAt: true } },
      memberships: { include: { workspace: { select: { id: true, name: true, slug: true, plan: true, _count: { select: { memberships: true } } } } }, orderBy: { createdAt: "asc" } },
      bonusPoints: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!u || u.deletedAt) throw notFound("user");
  const owned = u.memberships.filter((m) => m.role === "OWNER").map((m) => m.workspace.id);
  const contacts = owned.length ? await db.node.groupBy({ by: ["workspaceId"], where: { workspaceId: { in: owned }, type: "CONTACT", archivedAt: null }, _count: { _all: true } }) : [];
  const nContacts = new Map(contacts.map((c) => [c.workspaceId, c._count._all]));
  const actions = await db.adminLog.findMany({ where: { targetUserId: userId }, orderBy: { at: "desc" }, take: 10 });
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: u.phone,
    telegram: u.telegram,
    locale: u.locale,
    timezone: u.timezone,
    createdAt: u.createdAt,
    termsAcceptedAt: u.termsAcceptedAt,
    suspendedAt: u.suspendedAt,
    isSuperAdmin: isSuperAdminEmail(u.email),
    invitedBy: u.referredBy ? { id: u.referredBy.id, name: u.referredBy.name ?? u.referredBy.email } : null,
    invited: u.invited.map((i) => ({ id: i.id, name: i.name ?? i.email, at: i.referredAt })),
    points: u.bonusPoints.reduce((n, p) => n + p.points, 0),
    pointsLog: u.bonusPoints.map((p) => ({ id: p.id, points: p.points, reason: p.reason, note: p.note, at: p.createdAt })),
    workspaces: u.memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name, slug: m.workspace.slug, plan: m.workspace.plan, role: m.role, crm: crmLevel(m), members: m.workspace._count.memberships, contacts: m.role === "OWNER" ? (nContacts.get(m.workspace.id) ?? 0) : null })),
    actions: actions.map((a) => ({ id: a.id, action: a.action, at: a.at, data: a.data })),
  };
}

/** Blocks an account from signing in (and ends its open sessions), or lets it back. The platform owner cannot be blocked. */
export async function setSuspended(actorId: string, userId: string, suspended: boolean) {
  await requireSuperAdmin(actorId);
  const u = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, deletedAt: true } });
  if (!u || u.deletedAt) throw notFound("user");
  if (isSuperAdminEmail(u.email) || u.id === actorId) throw forbidden();
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { suspendedAt: suspended ? new Date() : null } }),
    ...(suspended ? [db.session.deleteMany({ where: { userId } })] : []),
  ]);
  await log(actorId, suspended ? "user.suspended" : "user.restored", userId);
  return { suspended };
}

export const planSchema = z.object({ plan: z.enum(["FREE", "PRO", "ENTERPRISE"]) });

/** Sets a workspace's plan by hand (a gift, a correction); a Stripe subscription, if there is one, is left as it is. */
export async function setWorkspacePlan(actorId: string, workspaceId: string, plan: Plan) {
  await requireSuperAdmin(actorId);
  const w = await db.workspace.findUnique({ where: { id: workspaceId }, select: { id: true, plan: true, name: true } });
  if (!w) throw notFound("workspace");
  await db.workspace.update({ where: { id: workspaceId }, data: { basePlan: plan } });
  await syncPlan(workspaceId);
  await log(actorId, "workspace.plan", null, { workspaceId, name: w.name, from: w.plan, to: plan });
  return { plan };
}

export const eraseUserSchema = z.object({ confirmEmail: z.string().trim().toLowerCase().email() });

/**
 * Deletes an account for good, on the platform owner's word (no code by e-mail: that protects a person from a stolen browser, and this is the
 * owner's own decision). The e-mail of the account has to be typed. What goes is the same as when a person deletes themselves: their sign-in,
 * sessions, notes, notifications, memberships; the address is freed, so the person can register again, for example through an invitation link.
 * An account that is the only owner of a workspace with a team is refused until the workspace is handed over.
 */
export async function eraseUserByAdmin(actorId: string, userId: string, input: z.infer<typeof eraseUserSchema>) {
  await requireSuperAdmin(actorId);
  const u = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, deletedAt: true } });
  if (!u || u.deletedAt) throw notFound("user");
  if (isSuperAdminEmail(u.email) || u.id === actorId) throw forbidden();
  if (input.confirmEmail.trim().toLowerCase() !== u.email.toLowerCase()) throw new ApiError(422, "email_mismatch", "Type the e-mail address of the account exactly to confirm");
  const status = await deletionStatus(userId);
  if (status.blockers.length > 0) throw new ApiError(409, "ownership_required", "This person owns a workspace that has a team: hand it over first", { blockers: status.blockers });
  await log(actorId, "user.deleted", userId, { email: u.email, workspacesDeleted: status.willDelete.length });
  await db.user.update({ where: { id: userId }, data: { deletionOptions: { alsoRemoveComments: false } } });
  return eraseAccount(userId);
}

export const memberRoleSchema = z
  .object({ role: z.enum(["ADMIN", "MEMBER", "GUEST", "CLIENT"]).optional(), crmLevel: z.enum(CRM_LEVELS).optional() })
  .refine((v) => v.role !== undefined || v.crmLevel !== undefined, "Nothing to update");

/**
 * Sets a person's role (and how much of the CRM they see) in a workspace by hand: for when someone was invited as a client by mistake, or
 * a member should become a guest. An owner's role is not changed here (a workspace must always have one). Written in the admin's log.
 */
export async function setMemberRole(actorId: string, workspaceId: string, userId: string, input: z.infer<typeof memberRoleSchema>) {
  await requireSuperAdmin(actorId);
  const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } }, include: { workspace: { select: { name: true } } } });
  if (!m) throw notFound("member");
  if (m.role === "OWNER") throw forbidden();
  const data: Prisma.MembershipUpdateInput = { ...(input.role ? { role: input.role } : {}), ...(input.crmLevel ? levelFields(input.crmLevel) : {}) };
  await db.membership.update({ where: { id: m.id }, data });
  await log(actorId, "member.role", userId, { workspaceId, name: m.workspace.name, from: { role: m.role, crm: crmLevel(m) }, to: { role: input.role ?? m.role, crm: input.crmLevel ?? crmLevel(m) } });
  return { role: input.role ?? m.role };
}

/** After changing the switch (or the list of preview addresses) in Vercel: puts every workspace's plan right now instead of waiting for the daily run. */
export async function recomputeAllPlans(actorId: string) {
  await requireSuperAdmin(actorId);
  const r = await recomputePlans();
  await log(actorId, "plans.recomputed", null, { ...r });
  return r;
}

export const bonusSchema = z.object({ points: z.number().int().min(-1000).max(1000).refine((n) => n !== 0, "Give a number other than 0"), note: z.string().trim().max(200).optional() });

/** Adds or takes away bonus points by hand, with a note; the balance is the sum of everything. */
export async function adjustBonus(actorId: string, userId: string, input: z.infer<typeof bonusSchema>) {
  await requireSuperAdmin(actorId);
  if (!(await db.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw notFound("user");
  await db.bonusPoint.create({ data: { userId, points: input.points, reason: "adjustment", note: input.note || null } });
  await log(actorId, "bonus.adjusted", userId, { points: input.points, note: input.note ?? null });
  const sum = await db.bonusPoint.aggregate({ where: { userId }, _sum: { points: true } });
  return { points: sum._sum.points ?? 0 };
}

export { ApiError };
