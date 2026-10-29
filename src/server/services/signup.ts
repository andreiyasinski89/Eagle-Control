import { randomInt } from "node:crypto";
import { db } from "@/server/db";
import { env } from "@/lib/env";
import { cleanName, isRefCode, isSignupLocale, type SignupLocale } from "@/modules/auth/signup";
import { displayName } from "@/modules/account/profile";
import { ApiError } from "@/server/http/errors";
import { sendMail } from "@/server/mail";
import { welcomeMail } from "@/server/auth/mail-texts";
import { can } from "@/server/policies";
import { assertContactCapacity, createContactIn } from "./crm/contacts";
import { isGrantedEmail } from "./grants";
import { loadWorkspaceMember } from "./nodes/access";
import { notify } from "./notify";

const DAY = 86_400_000;
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

const normalize = (email: string) => email.trim().toLowerCase();

// ── what was typed before the link was sent ────────────────────────────────

export interface IntentInput {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  locale?: string | null;
  refCode?: string | null;
  /** The platform invitation link they came through (/i/<code>). */
  inviteCode?: string | null;
}

/** Remembers the name, language and invitation code of someone about to create an account, until their first sign-in makes it. */
export async function saveSignupIntent(input: IntentInput, now = new Date()): Promise<void> {
  const email = normalize(input.email);
  const data = { firstName: cleanName(input.firstName), lastName: cleanName(input.lastName), locale: isSignupLocale(input.locale) ? input.locale : null, refCode: isRefCode(input.refCode) ? input.refCode : null, inviteCode: isRefCode(input.inviteCode) ? input.inviteCode : null };
  await db.signupIntent.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 2 * DAY) } } });
  await db.signupIntent.upsert({ where: { email }, create: { email, ...data, createdAt: now }, update: { ...data, createdAt: now } });
}

/** The language chosen for this address, for the language of the e-mail. */
export async function intentLocale(email: string): Promise<SignupLocale> {
  const i = await db.signupIntent.findUnique({ where: { email: normalize(email) }, select: { locale: true } });
  return isSignupLocale(i?.locale) ? i.locale : "en";
}

/**
 * Called when an account has just been made: gives it the name and language that were typed, and, when it came through an
 * invitation link, puts the person in the sponsor's CRM. Nothing here may stop a sign-in, so each step stands alone.
 */
export async function applySignupIntent(user: { id: string; email: string }, now = new Date()): Promise<void> {
  const email = normalize(user.email);
  const intent = await db.signupIntent.findUnique({ where: { email } });
  if (!intent) return;
  await db.signupIntent.delete({ where: { email } }).catch(() => undefined);
  if (now.getTime() - intent.createdAt.getTime() > DAY) return;
  const name = displayName(intent.firstName, intent.lastName);
  await db.user.update({ where: { id: user.id }, data: { ...(intent.firstName ? { firstName: intent.firstName } : {}), ...(intent.lastName ? { lastName: intent.lastName } : {}), ...(name ? { name } : {}), ...(intent.locale ? { locale: intent.locale } : {}) } });
  if (intent.inviteCode) {
    try {
      await joinByInvite({ id: user.id, email, firstName: intent.firstName, lastName: intent.lastName }, intent.inviteCode);
    } catch (e) {
      console.error("platform invite failed", e instanceof Error ? e.message : e);
    }
  }
  if (intent.refCode) {
    try {
      await joinByReferral({ id: user.id, email, firstName: intent.firstName, lastName: intent.lastName }, intent.refCode);
    } catch (e) {
      console.error("referral join failed", e instanceof Error ? e.message : e);
    }
  }
}

// ── invitation links ───────────────────────────────────────────────────────

const newCode = () => Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** The member's invitation link for this workspace, made the first time it is asked for. Needs the right to write in the CRM. */
export async function getOrCreateReferralLink(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:write");
  let link = await db.referralLink.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  for (let i = 0; !link && i < 5; i++) {
    try {
      link = await db.referralLink.create({ data: { userId, workspaceId, code: newCode() } });
    } catch {
      link = await db.referralLink.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
    }
  }
  if (!link) throw new ApiError(500, "link_failed", "The link could not be made");
  const joined = await db.referralJoin.count({ where: { linkId: link.id } });
  // The link for clients and acquaintances: the workspace's first open lead form with the person's own label on it.
  const form = await db.leadForm.findFirst({ where: { workspaceId, enabled: true }, orderBy: { id: "asc" }, select: { publicKey: true } });
  const me = await db.user.findUnique({ where: { id: userId }, select: { name: true, firstName: true, lastName: true, email: true } });
  const name = [me?.firstName, me?.lastName].filter(Boolean).join(" ") || me?.name?.trim() || me?.email.split("@")[0] || "";
  return { code: link.code, url: `${env().APP_URL}/r/${link.code}`, leadUrl: form ? `${env().APP_URL}/f/${form.publicKey}?ref=${link.code}` : null, name, joined };
}

/** Who a code belongs to, for the sentence "invited by …" on the sign-up page. Nothing else about the person is given out. */
export async function referralInfo(code: string | null | undefined): Promise<{ inviter: string } | null> {
  if (!isRefCode(code)) return null;
  const link = await db.referralLink.findUnique({ where: { code }, include: { user: { select: { name: true, email: true, deletedAt: true } } } });
  if (!link || link.user.deletedAt) return null;
  return { inviter: link.user.name?.trim() || link.user.email.split("@")[0] || "" };
}

interface NewPerson {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * A person has made an account through a sponsor's link: they become a new lead in the sponsor's CRM (owned by the sponsor, under
 * the sponsor's partner card when there is one), the sponsor is told, and the join is recorded once. Someone already there by
 * e-mail is not made twice.
 */
export async function joinByReferral(person: NewPerson, code: string): Promise<{ contactId: string | null } | null> {
  const link = await db.referralLink.findUnique({ where: { code }, include: { workspace: { select: { slug: true } } } });
  if (!link || link.userId === person.id) return null;
  const sponsor = await db.membership.findUnique({ where: { userId_workspaceId: { userId: link.userId, workspaceId: link.workspaceId } } });
  if (!sponsor || !can(sponsor, "crm:write")) return null;
  if (await db.referralJoin.findUnique({ where: { linkId_userId: { linkId: link.id, userId: person.id } } })) return null;

  const first = person.firstName?.trim() || person.email.split("@")[0] || person.email;
  const result = await db.$transaction(async (tx) => {
    let contactId: string | null = (await tx.contact.findFirst({ where: { workspaceId: link.workspaceId, emails: { has: person.email }, node: { archivedAt: null } }, select: { nodeId: true } }))?.nodeId ?? null;
    let created = false;
    if (!contactId) {
      try {
        await assertContactCapacity(tx, link.workspaceId, 1);
        const card = await tx.contact.findFirst({ where: { workspaceId: link.workspaceId, linkedUserId: link.userId, stage: "PARTNER", node: { archivedAt: null } }, select: { nodeId: true } });
        contactId = (await createContactIn(tx, link.userId, link.workspaceId, { firstName: first, lastName: person.lastName?.trim() || null, position: null, emails: [person.email], phones: [], messengers: {}, stage: "NEW", source: "Referral link", ownerId: link.userId, sponsorId: card?.nodeId ?? null })).id;
        created = true;
      } catch {
        contactId = null; // the plan's contact limit: the join is still recorded
      }
    }
    if (contactId) await tx.crmActivity.create({ data: { workspaceId: link.workspaceId, type: "NOTE", subject: "Created an account through your invitation link", ownerId: link.userId, contactId, completedAt: new Date() } });
    await tx.referralJoin.create({ data: { linkId: link.id, userId: person.id, contactId } });
    return { contactId, created };
  });
  await notify({
    userId: link.userId,
    workspaceId: link.workspaceId,
    kind: "lead",
    title: `${[first, person.lastName?.trim()].filter(Boolean).join(" ")} joined through your link`,
    body: result.created ? "Added to your people as a new lead." : undefined,
    url: result.contactId ? `/crm/people?contact=${result.contactId}` : "/crm/people",
    dedupeKey: `referral:${link.id}:${person.id}`,
    payload: { contactId: result.contactId },
  }).catch(() => undefined);
  return { contactId: result.contactId };
}

// ── inviting people to use the platform ────────────────────────────────────

/** The person's own link for inviting others to the platform, made the first time it is asked for. */
async function ensureInviteCode(userId: string): Promise<string> {
  const cur = await db.user.findUnique({ where: { id: userId }, select: { inviteCode: true } });
  if (cur?.inviteCode) return cur.inviteCode;
  for (let i = 0; i < 5; i++) {
    try {
      return (await db.user.update({ where: { id: userId }, data: { inviteCode: newCode() }, select: { inviteCode: true } })).inviteCode as string;
    } catch {
      const again = await db.user.findUnique({ where: { id: userId }, select: { inviteCode: true } });
      if (again?.inviteCode) return again.inviteCode;
    }
  }
  throw new ApiError(500, "link_failed", "The link could not be made");
}

/** How far an invited person has got, in steps only: made a workspace, added people. Never what is in them. */
export interface InvitedPerson {
  id: string;
  name: string;
  joinedAt: Date;
  steps: { workspace: boolean; people: boolean };
}

export async function getInvites(userId: string) {
  const code = await ensureInviteCode(userId);
  const [people, points] = await Promise.all([
    db.user.findMany({ where: { referredById: userId, deletedAt: null }, orderBy: { referredAt: "desc" }, select: { id: true, name: true, firstName: true, email: true, referredAt: true, createdAt: true } }),
    db.bonusPoint.aggregate({ where: { userId }, _sum: { points: true } }),
  ]);
  const ids = people.map((p) => p.id);
  const [owners, contacts] = ids.length
    ? await Promise.all([
        db.membership.findMany({ where: { userId: { in: ids }, role: "OWNER" }, select: { userId: true } }),
        db.node.groupBy({ by: ["createdById"], where: { createdById: { in: ids }, type: "CONTACT" }, _count: { _all: true } }),
      ])
    : [[], []];
  const hasWs = new Set(owners.map((o) => o.userId));
  const hasPeople = new Set(contacts.map((c) => c.createdById));
  const invited: InvitedPerson[] = people.map((p) => ({ id: p.id, name: p.name?.trim() || p.email.split("@")[0] || "", joinedAt: p.referredAt ?? p.createdAt, steps: { workspace: hasWs.has(p.id), people: hasPeople.has(p.id) } }));
  return { code, url: `${env().APP_URL}/i/${code}`, points: points._sum.points ?? 0, invited };
}

/** Who a platform invitation code belongs to, for the sentence on the sign-up page. Nothing else about them. */
export async function inviteInfo(code: string | null | undefined): Promise<{ inviter: string } | null> {
  if (!isRefCode(code)) return null;
  const u = await db.user.findUnique({ where: { inviteCode: code }, select: { name: true, email: true, deletedAt: true, suspendedAt: true } });
  if (!u || u.deletedAt || u.suspendedAt) return null;
  return { inviter: u.name?.trim() || u.email.split("@")[0] || "" };
}

/**
 * A person has created an account through someone's platform link: they are marked as invited by them (once, never by themselves),
 * the inviter gets one bonus point and a notification. The new person stays a separate user with their own workspace;
 * nothing of theirs is shared with the inviter.
 */
export async function joinByInvite(person: NewPerson, code: string): Promise<{ inviterId: string } | null> {
  const inviter = await db.user.findUnique({ where: { inviteCode: code }, select: { id: true, deletedAt: true, suspendedAt: true } });
  if (!inviter || inviter.deletedAt || inviter.suspendedAt || inviter.id === person.id) return null;
  const me = await db.user.findUnique({ where: { id: person.id }, select: { referredById: true } });
  if (!me || me.referredById) return null;
  await db.$transaction([
    db.user.update({ where: { id: person.id }, data: { referredById: inviter.id, referredAt: new Date() } }),
    db.bonusPoint.create({ data: { userId: inviter.id, points: 1, reason: "invite", refUserId: person.id } }),
  ]);
  const ws = await db.membership.findFirst({ where: { userId: inviter.id, role: { not: "CLIENT" } }, orderBy: { createdAt: "asc" }, select: { workspaceId: true } });
  if (ws) {
    const first = person.firstName?.trim() || person.email.split("@")[0] || person.email;
    await notify({ userId: inviter.id, workspaceId: ws.workspaceId, kind: "invite_joined", title: `${[first, person.lastName?.trim()].filter(Boolean).join(" ")} joined MeetOwl through your link`, body: "+1 bonus point", url: "/account", dedupeKey: `invite:${person.id}` }).catch(() => undefined);
  }
  return { inviterId: inviter.id };
}

// ── making the first workspace ─────────────────────────────────────────────

/** A person gets one workspace of their own on the free plan; more need a paid plan (or an invitation, which is not creating one). */
export async function assertCanCreateWorkspace(userId: string): Promise<void> {
  const owned = await db.membership.findMany({ where: { userId, role: "OWNER" }, select: { workspace: { select: { plan: true } } } });
  if (owned.length === 0) return;
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user && isGrantedEmail(user.email)) return;
  if (owned.some((o) => o.workspace.plan !== "FREE")) return;
  throw new ApiError(402, "workspace_limit", "The free plan includes one workspace of your own. Invitations to other workspaces are not limited.");
}

/** The welcome e-mail with the first three steps; sent when the person has made their first workspace, never to fail the request. */
export async function sendWelcome(userId: string, workspace: { name: string; slug: string }): Promise<void> {
  try {
    const u = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true, locale: true } });
    if (!u) return;
    const mail = welcomeMail(isSignupLocale(u.locale) ? u.locale : "en", u.name, workspace.name, `${env().APP_URL}/w/${workspace.slug}/start`);
    await sendMail({ to: u.email, ...mail });
  } catch (e) {
    console.error("welcome e-mail failed", e instanceof Error ? e.message : e);
  }
}
