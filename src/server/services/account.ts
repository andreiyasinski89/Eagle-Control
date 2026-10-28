import { randomInt } from "node:crypto";
import { z } from "zod";
import { Prisma, type Role } from "@prisma/client";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { ApiError, forbidden, notFound } from "@/server/http/errors";
import { rateLimit } from "@/server/http/rate-limit";
import { sendMail } from "@/server/mail";
import { deleteObject } from "@/server/storage";
import { disconnectGoogle } from "@/server/integrations/google";
import { disconnectTelegram } from "@/server/integrations/telegram";
import { safeEqual, sha256 } from "@/server/integrations/common";
import { dueForErasure, planErasure, REMOVED_COMMENT, tombstoneEmail, type WorkspaceFacts } from "@/modules/account/erasure";
import { cancelSubscriptionNow } from "./billing";
import { isDemoAddress } from "./demo-mode";
import { syncGrantedPlans } from "./grants";
import { loadWorkspaceMember } from "./nodes/access";

const ROLES: Role[] = ["OWNER", "ADMIN", "MEMBER", "GUEST", "CLIENT"];
export const CHALLENGE_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const EXPORT_ROWS = 20_000;

// ── one-time codes for sensitive actions ───────────────────────────────────

export type Sensitive = "export" | "delete" | "admin";

const hashCode = (userId: string, action: Sensitive, code: string) => sha256(`${userId}:${action}:${code}`);

async function activeUser(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u || u.deletedAt) throw notFound("account");
  return u;
}

/**
 * E-mails a 6-digit code. A stolen browser session cannot export or erase an account without also reading the owner's mailbox.
 * At most 3 codes an hour per person.
 */
export async function sendChallenge(userId: string, action: Sensitive, now = new Date()): Promise<{ sentTo: string; expiresAt: Date }> {
  const u = await activeUser(userId);
  if (env().DEMO_MODE && isDemoAddress(u.email)) throw new ApiError(403, "demo_account", "The demo account cannot be exported or deleted.");
  if ((await db.accountChallenge.count({ where: { userId, createdAt: { gt: new Date(now.getTime() - 3_600_000) } } })) >= 3) throw new ApiError(429, "rate_limited", "Too many codes requested. Try again in an hour.");
  const code = String(randomInt(100_000, 1_000_000));
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
  await db.accountChallenge.create({ data: { userId, action, codeHash: hashCode(userId, action, code), expiresAt } });
  const what = action === "export" ? "download a copy of your MeetOwl data" : action === "admin" ? "confirm sensitive actions in the MeetOwl platform admin for 10 minutes" : "delete your MeetOwl account";
  await sendMail({
    to: u.email,
    subject: `Your MeetOwl confirmation code: ${code}`,
    text: `Use this code to ${what}: ${code}\n\nIt works for 10 minutes. If you did not ask for it, ignore this e-mail and consider signing out of all devices.`,
    html: `<p>Use this code to ${what}:</p><p style="font-size:24px;letter-spacing:4px"><b>${code}</b></p><p>It works for 10 minutes. If you did not ask for it, ignore this e-mail.</p>`,
  });
  return { sentTo: u.email.replace(/^(.).*(@.*)$/, "$1***$2"), expiresAt };
}

/** Checks the newest unused code; five wrong guesses burn it. A right code works once. */
export async function consumeChallenge(userId: string, action: Sensitive, code: string, now = new Date()): Promise<void> {
  const bad = () => new ApiError(403, "invalid_code", "That code is not valid or has expired. Ask for a new one.");
  const c = await db.accountChallenge.findFirst({ where: { userId, action, usedAt: null, expiresAt: { gt: now }, attempts: { lt: MAX_ATTEMPTS } }, orderBy: { createdAt: "desc" } });
  if (!c) throw bad();
  if (!/^\d{6}$/.test(code) || !safeEqual(c.codeHash, hashCode(userId, action, code))) {
    await db.accountChallenge.update({ where: { id: c.id }, data: { attempts: { increment: 1 } } });
    throw bad();
  }
  const claimed = await db.accountChallenge.updateMany({ where: { id: c.id, usedAt: null }, data: { usedAt: now } });
  if (claimed.count === 0) throw bad(); // used by a parallel request
}

const record = (userId: string, action: string, detail?: Prisma.InputJsonValue) => db.accountEvent.create({ data: { userId, action, detail } });

// ── export ─────────────────────────────────────────────────────────────────

export const exportSchema = z.object({ code: z.string().regex(/^\d{6}$/) });

/**
 * Everything MeetOwl holds about the person, in one JSON document: their profile, what they created or wrote, and their settings.
 * Other people's content is not included, and neither are secrets (token values, OAuth tokens, signing keys).
 */
export async function exportAccount(userId: string, code: string, now = new Date()) {
  await activeUser(userId);
  await consumeChallenge(userId, "export", code, now);
  const take = EXPORT_ROWS;
  const [user, memberships, projectAccess, created, assigned, comments, attachments, time, crmActs, reminders, notifications, prefs, integrations, tokens, ai, activity, events, approvals, savedFilters, timer, notes] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId } }),
    db.membership.findMany({ where: { userId }, include: { workspace: { select: { name: true, slug: true, plan: true } } } }),
    db.projectMember.findMany({ where: { userId }, include: { node: { select: { title: true } } } }),
    db.node.findMany({ where: { createdById: userId }, orderBy: { createdAt: "asc" }, take }),
    db.node.findMany({ where: { assigneeId: userId, archivedAt: null }, select: { id: true, title: true, type: true, status: true, dueDate: true }, take }),
    db.comment.findMany({ where: { authorId: userId }, orderBy: { createdAt: "asc" }, take, include: { node: { select: { title: true } } } }),
    db.attachment.findMany({ where: { uploadedById: userId }, select: { id: true, fileName: true, mime: true, size: true, createdAt: true, node: { select: { title: true } } }, take }),
    db.timeEntry.findMany({ where: { userId }, orderBy: { date: "asc" }, take, include: { node: { select: { title: true } } } }),
    db.crmActivity.findMany({ where: { ownerId: userId }, orderBy: { createdAt: "asc" }, take }),
    db.reminder.findMany({ where: { userId }, take }),
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 2000 }),
    db.notificationPreference.findMany({ where: { userId } }),
    db.userIntegration.findMany({ where: { userId }, select: { kind: true, externalId: true, workspaceId: true, createdAt: true } }),
    db.apiToken.findMany({ where: { userId }, select: { name: true, prefix: true, scope: true, expiresAt: true, lastUsedAt: true, revokedAt: true, createdAt: true } }),
    db.aiUsage.aggregate({ where: { userId }, _sum: { inputTokens: true, outputTokens: true }, _count: true }),
    db.activityLog.findMany({ where: { actorId: userId }, orderBy: { createdAt: "desc" }, take: 5000 }),
    db.accountEvent.findMany({ where: { userId }, orderBy: { at: "asc" } }),
    db.approval.findMany({ where: { OR: [{ requestedById: userId }, { decidedById: userId }] }, take }),
    db.savedFilter.findMany({ where: { userId } }),
    db.runningTimer.findUnique({ where: { userId } }),
    db.note.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, take }),
  ]);
  await record(userId, "exported");
  const full = (rows: unknown[]) => rows.length >= take;
  return {
    meta: { generatedAt: now.toISOString(), format: "meetowl-account-export/1", note: "Your own data. Content written by other people, and secrets, are not included. Lists are capped; `truncated` says which." },
    truncated: { nodesCreated: full(created), comments: full(comments), timeEntries: full(time), activities: full(crmActs) },
    profile: { id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, timezone: user.timezone, locale: user.locale, skills: user.skills, avatar: user.avatar, image: user.image, createdAt: user.createdAt },
    memberships: memberships.map((m) => ({ workspace: m.workspace.name, slug: m.workspace.slug, plan: m.workspace.plan, role: m.role, crmAccess: m.crmAccess, hourlyRate: m.hourlyRate === null ? null : Number(m.hourlyRate), since: m.createdAt })),
    projectAccess: projectAccess.map((p) => ({ project: p.node.title, visibleToClientOnly: p.visibleToClientOnly })),
    nodesCreated: created.map((n) => ({ id: n.id, type: n.type, title: n.title, description: n.description, status: n.status, startDate: n.startDate, dueDate: n.dueDate, data: n.data, createdAt: n.createdAt })),
    nodesAssignedToYou: assigned,
    comments: comments.map((c) => ({ id: c.id, on: c.node.title, body: c.body, createdAt: c.createdAt })),
    attachments: attachments.map((a) => ({ id: a.id, fileName: a.fileName, mime: a.mime, size: a.size, on: a.node.title, createdAt: a.createdAt })),
    timeEntries: time.map((t) => ({ on: t.node?.title ?? t.label ?? null, date: t.date, minutes: t.minutes, billable: t.billable, note: t.note })),
    crmActivities: crmActs.map((a) => ({ type: a.type, subject: a.subject, body: a.body, dueAt: a.dueAt, completedAt: a.completedAt, createdAt: a.createdAt })),
    runningTimer: timer ? { startedAt: timer.startedAt } : null,
    reminders: reminders.map((r) => ({ remindAt: r.remindAt, channel: r.channel, done: r.done })),
    notifications: notifications.map((n) => ({ kind: n.kind, payload: n.payload, readAt: n.readAt, createdAt: n.createdAt })),
    notificationPreferences: prefs.map((p) => ({ kind: p.kind, channels: p.channels })),
    notes: notes.map((n) => ({ kind: n.kind, title: n.title, body: n.body, url: n.url, pinned: n.pinned, createdAt: n.createdAt, updatedAt: n.updatedAt })),
    savedFilters: savedFilters.map((f) => ({ name: f.name, criteria: f.criteria })),
    integrations,
    apiTokens: tokens,
    aiUsage: { calls: ai._count, inputTokens: ai._sum.inputTokens ?? 0, outputTokens: ai._sum.outputTokens ?? 0 },
    approvals: approvals.map((a) => ({ id: a.id, status: a.status, note: a.note, createdAt: a.createdAt, decidedAt: a.decidedAt })),
    activityLog: activity.map((a) => ({ action: a.action, nodeId: a.nodeId, diff: a.diff, at: a.createdAt })),
    accountEvents: events.map((e) => ({ action: e.action, at: e.at })),
  };
}

// ── what erasing would do ──────────────────────────────────────────────────

async function facts(userId: string): Promise<WorkspaceFacts[]> {
  const mine = await db.membership.findMany({ where: { userId }, include: { workspace: { select: { name: true } } } });
  if (mine.length === 0) return [];
  const rows = await db.membership.groupBy({ by: ["workspaceId", "role"], where: { workspaceId: { in: mine.map((m) => m.workspaceId) }, userId: { not: userId } }, _count: true });
  return mine.map((m) => {
    const others = Object.fromEntries(ROLES.map((r) => [r, 0])) as Record<Role, number>;
    for (const r of rows) if (r.workspaceId === m.workspaceId) others[r.role] = r._count;
    return { workspaceId: m.workspaceId, name: m.workspace.name, role: m.role, others };
  });
}

export async function deletionStatus(userId: string, now = new Date()) {
  const u = await activeUser(userId);
  const plan = planErasure(await facts(userId));
  const grace = env().ACCOUNT_DELETION_GRACE_DAYS;
  const slugs = new Map((await db.workspace.findMany({ where: { id: { in: [...plan.blockers, ...plan.willDelete, ...plan.leaves].map((w) => w.workspaceId) } }, select: { id: true, slug: true } })).map((w) => [w.id, w.slug]));
  const withSlug = <T extends { workspaceId: string }>(rows: T[]) => rows.map((r) => ({ ...r, slug: slugs.get(r.workspaceId) ?? "" }));
  return {
    pending: !!u.deletionRequestedAt,
    requestedAt: u.deletionRequestedAt,
    scheduledFor: u.deletionRequestedAt ? new Date(u.deletionRequestedAt.getTime() + grace * 86_400_000) : null,
    graceDays: grace,
    canRequest: plan.blockers.length === 0,
    blockers: withSlug(plan.blockers),
    willDelete: withSlug(plan.willDelete),
    leaves: withSlug(plan.leaves),
    now,
  };
}

// ── asking, cancelling ─────────────────────────────────────────────────────

export const deletionSchema = z.object({ code: z.string().regex(/^\d{6}$/), confirmEmail: z.string().trim().toLowerCase().email(), alsoRemoveComments: z.boolean().default(false) });

export async function requestDeletion(userId: string, input: z.infer<typeof deletionSchema>, now = new Date()) {
  const u = await activeUser(userId);
  if (input.confirmEmail.trim().toLowerCase() !== u.email.toLowerCase()) throw new ApiError(422, "email_mismatch", "Type your e-mail address exactly to confirm");
  const status = await deletionStatus(userId, now);
  if (status.blockers.length > 0) throw new ApiError(409, "ownership_required", "Hand over the workspaces you own first", { blockers: status.blockers });
  await consumeChallenge(userId, "delete", input.code, now);
  await db.user.update({ where: { id: userId }, data: { deletionRequestedAt: now, deletionOptions: { alsoRemoveComments: input.alsoRemoveComments } } });
  await record(userId, "deletion_requested", { alsoRemoveComments: input.alsoRemoveComments, willDelete: status.willDelete.map((w) => w.workspaceId) });
  const when = new Date(now.getTime() + env().ACCOUNT_DELETION_GRACE_DAYS * 86_400_000);
  await sendMail({
    to: u.email,
    subject: "Your MeetOwl account will be deleted",
    text: env().ACCOUNT_DELETION_GRACE_DAYS === 0 ? "Your account is being deleted now." : `Your MeetOwl account is scheduled for deletion on ${when.toUTCString()}. Until then you can cancel in Settings → Account. After that it cannot be undone.`,
    html: `<p>Your MeetOwl account is scheduled for deletion${env().ACCOUNT_DELETION_GRACE_DAYS === 0 ? " now" : ` on <b>${when.toUTCString()}</b>`}.</p><p>Until then you can cancel it in Settings → Account. After that it cannot be undone.</p>`,
  }).catch((e) => console.error("deletion notice not sent", e instanceof Error ? e.message : e));
  if (env().ACCOUNT_DELETION_GRACE_DAYS === 0) return { ...(await eraseAccount(userId, now)), immediate: true };
  return { result: "scheduled" as const, scheduledFor: when, immediate: false };
}

export async function cancelDeletion(userId: string): Promise<void> {
  const u = await activeUser(userId);
  if (!u.deletionRequestedAt) return;
  await db.user.update({ where: { id: userId }, data: { deletionRequestedAt: null, deletionOptions: Prisma.DbNull } });
  await record(userId, "deletion_cancelled");
}

// ── handing a workspace over ───────────────────────────────────────────────

/** The owner makes another team member the owner and steps down to admin. */
export async function transferOwnership(userId: string, workspaceId: string, targetUserId: string): Promise<void> {
  const me = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  if (me.role !== "OWNER") throw forbidden();
  if (targetUserId === userId) throw new ApiError(422, "same_person", "Choose someone else");
  const target = await db.membership.findUnique({ where: { userId_workspaceId: { userId: targetUserId, workspaceId } } });
  if (!target || target.role === "CLIENT" || target.role === "GUEST") throw new ApiError(422, "not_a_team_member", "Choose a member of the team");
  await db.$transaction([
    db.membership.update({ where: { id: target.id }, data: { role: "OWNER", crmAccess: true } }),
    db.membership.update({ where: { id: me.id }, data: { role: "ADMIN" } }),
  ]);
  await syncGrantedPlans(targetUserId);
  await record(userId, "ownership_transferred", { workspaceId, to: targetUserId });
}

// ── erasing ────────────────────────────────────────────────────────────────

export type ErasureResult = { result: "erased" } | { result: "blocked"; blockers: { workspaceId: string; name: string }[] };

/**
 * The account goes. Credentials, sessions, integrations, tokens, notifications and memberships are deleted; workspaces where
 * the person was the only team member are deleted with their files and their subscription is cancelled first. The `User` row
 * stays as an anonymous "Deleted user" (new name, unreachable address), so tasks, comments, time entries and history keep
 * their shape without pointing at a person. If the person ticked it, their comments are replaced by "[removed]" and their
 * uploads deleted.
 */
export async function eraseAccount(userId: string, now = new Date()): Promise<ErasureResult> {
  const u = await activeUser(userId);
  const options = (u.deletionOptions ?? {}) as { alsoRemoveComments?: boolean };
  const plan = planErasure(await facts(userId));
  if (plan.blockers.length > 0) {
    await db.user.update({ where: { id: userId }, data: { deletionRequestedAt: null } });
    await record(userId, "deletion_blocked", { blockers: plan.blockers.map((b) => b.workspaceId) });
    await sendMail({ to: u.email, subject: "Your MeetOwl account was not deleted", text: `The deletion was stopped because you are the only owner of: ${plan.blockers.map((b) => b.name).join(", ")}. Hand them over, then request deletion again.`, html: `<p>The deletion was stopped because you are the only owner of: ${plan.blockers.map((b) => b.name).join(", ")}.</p><p>Hand them over, then request deletion again.</p>` }).catch(() => undefined);
    return { result: "blocked", blockers: plan.blockers };
  }
  const gone = plan.willDelete.map((w) => w.workspaceId);

  // Outside the database first, and in an order that fails safe: money, then the services that hold tokens.
  for (const id of gone) await cancelSubscriptionNow(id);
  for (const row of await db.userIntegration.findMany({ where: { userId }, select: { kind: true, workspaceId: true } })) {
    if (!row.workspaceId) continue;
    if (row.kind === "GOOGLE_CALENDAR") await disconnectGoogle(userId, row.workspaceId).catch((e) => console.error("google disconnect", e instanceof Error ? e.message : e));
    if (row.kind === "TELEGRAM") await disconnectTelegram(userId, row.workspaceId).catch((e) => console.error("telegram disconnect", e instanceof Error ? e.message : e));
  }

  const keys = (await db.attachment.findMany({ where: { OR: [{ node: { workspaceId: { in: gone } } }, ...(options.alsoRemoveComments ? [{ uploadedById: userId }] : [])] }, select: { url: true } })).map((a) => a.url);
  const tokenIds = (await db.apiToken.findMany({ where: { userId }, select: { id: true } })).map((t) => t.id);

  await db.$transaction(
    async (tx) => {
      if (gone.length) await tx.workspace.deleteMany({ where: { id: { in: gone } } });
      if (options.alsoRemoveComments) {
        await tx.comment.updateMany({ where: { authorId: userId }, data: { body: REMOVED_COMMENT as unknown as Prisma.InputJsonValue, mentions: [] } });
        await tx.attachment.deleteMany({ where: { uploadedById: userId } });
      }
      await tx.apiIdempotency.deleteMany({ where: { tokenId: { in: tokenIds } } });
      await tx.apiToken.deleteMany({ where: { userId } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.account.deleteMany({ where: { userId } });
      await tx.verificationToken.deleteMany({ where: { identifier: u.email } });
      await tx.accountChallenge.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { OR: [{ userId }, { payload: { path: ["byUserId"], equals: userId } }] } });
      await tx.notificationPreference.deleteMany({ where: { userId } });
      await tx.reminder.deleteMany({ where: { userId } });
      await tx.runningTimer.deleteMany({ where: { userId } });
      await tx.savedFilter.deleteMany({ where: { userId } });
      await tx.calendarLink.deleteMany({ where: { userId } });
      await tx.userIntegration.deleteMany({ where: { userId } });
      await tx.projectMember.deleteMany({ where: { userId } });
      await tx.membership.deleteMany({ where: { userId } });
      await tx.invitation.deleteMany({ where: { email: { equals: u.email, mode: "insensitive" } } });
      await tx.aiUsage.updateMany({ where: { userId }, data: { userId: null } });
      await tx.node.updateMany({ where: { assigneeId: userId }, data: { assigneeId: null } });
      await tx.company.updateMany({ where: { ownerId: userId }, data: { ownerId: null } });
      await tx.contact.updateMany({ where: { ownerId: userId }, data: { ownerId: null } });
      await tx.deal.updateMany({ where: { ownerId: userId }, data: { ownerId: null } });
      await tx.user.update({
        where: { id: userId },
        data: { name: "Deleted user", email: tombstoneEmail(userId), emailVerified: null, avatar: null, image: null, skills: [], timezone: "UTC", locale: "en", deletedAt: now, deletionRequestedAt: null, deletionOptions: Prisma.DbNull },
      });
    },
    { timeout: 120_000 },
  );

  await Promise.all(keys.map((k) => deleteObject(k).catch(() => undefined))); // an orphaned object is harmless; the rows are gone
  await record(userId, "deleted", { workspacesDeleted: gone.length, commentsRemoved: !!options.alsoRemoveComments });
  await sendMail({ to: u.email, subject: "Your MeetOwl account was deleted", text: "Your MeetOwl account and personal data were deleted. Work you did with others stays, shown as \"Deleted user\". Nothing else about you is kept except a record that the deletion happened.", html: "<p>Your MeetOwl account and personal data were deleted.</p><p>Work you did with others stays, shown as “Deleted user”. Nothing else about you is kept except a record that the deletion happened.</p>" }).catch((e) => console.error("deletion receipt not sent", e instanceof Error ? e.message : e));
  return { result: "erased" };
}

/** The hourly job: erases every account whose grace period is over. One failure does not stop the others; it is retried next hour. */
export async function runDueErasures(now = new Date()): Promise<{ erased: number; blocked: number; failed: number }> {
  const grace = env().ACCOUNT_DELETION_GRACE_DAYS;
  const out = { erased: 0, blocked: 0, failed: 0 };
  const pending = await db.user.findMany({ where: { deletionRequestedAt: { not: null }, deletedAt: null }, select: { id: true, deletionRequestedAt: true }, take: 50 });
  for (const u of pending) {
    if (!u.deletionRequestedAt || !dueForErasure(u.deletionRequestedAt, grace, now)) continue;
    try {
      const r = await eraseAccount(u.id, now);
      if (r.result === "erased") out.erased++;
      else out.blocked++;
    } catch (e) {
      out.failed++;
      console.error("erasure failed", u.id, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

// per-person limiter for the export download itself (the code already gates it)
export const exportAllowed = (userId: string, now = Date.now()) => rateLimit(`export:${userId}`, 3, 3_600_000, now);
