import type { Role } from "@prisma/client";
import { db } from "@/server/db";
import { env } from "@/lib/env";
import { hashToken, newToken } from "@/lib/token";
import { checkLimit } from "@/modules/plans";
import { canGrantRole } from "@/server/policies";
import { ApiError, conflict, forbidden, limitReached, notFound } from "@/server/http/errors";
import { sendMail } from "@/server/mail";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CreateInput {
  workspaceId: string;
  actor: { userId: string; role: Role };
  email: string;
  role: Role;
  crmAccess: boolean;
  projectIds: string[];
}

function escapeHtml(s: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return s.replace(/[&<>"']/g, (c) => map[c] ?? c);
}

export async function createInvitation(input: CreateInput) {
  const email = input.email.trim().toLowerCase();
  if (!canGrantRole(input.actor.role, input.role)) throw forbidden();

  const workspace = await db.workspace.findUnique({ where: { id: input.workspaceId } });
  if (!workspace) throw notFound("workspace");

  const existingMember = await db.membership.findFirst({
    where: { workspaceId: workspace.id, user: { email } },
    select: { id: true },
  });
  if (existingMember) throw conflict("already_member", "This person is already a member");

  // Re-inviting replaces the previous pending invitation (and its link).
  await db.invitation.updateMany({
    where: { workspaceId: workspace.id, email, status: "PENDING" },
    data: { status: "REVOKED" },
  });

  const [members, pending] = await Promise.all([
    db.membership.count({ where: { workspaceId: workspace.id } }),
    db.invitation.count({ where: { workspaceId: workspace.id, status: "PENDING", expiresAt: { gt: new Date() } } }),
  ]);
  const check = checkLimit(workspace.plan, "users", members + pending);
  if (!check.allowed) throw limitReached(check.limit, "users");

  const token = newToken();
  const invitation = await db.invitation.create({
    data: {
      workspaceId: workspace.id,
      email,
      role: input.role,
      crmAccess: input.crmAccess,
      projectIds: input.projectIds,
      tokenHash: hashToken(token),
      invitedById: input.actor.userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });

  const link = `${env().APP_URL}/invite/${token}`;
  await sendMail({
    to: email,
    subject: `You are invited to ${workspace.name} on MeetOwl`,
    text: `Join ${workspace.name} on MeetOwl: ${link}\n\nThe invitation expires in 7 days.`,
    html: `<p>You are invited to <b>${escapeHtml(workspace.name)}</b> on MeetOwl.</p><p><a href="${link}">Accept invitation</a></p><p>The invitation expires in 7 days.</p>`,
  });
  return invitation;
}

export function listInvitations(workspaceId: string) {
  return db.invitation.findMany({
    where: { workspaceId, status: "PENDING", expiresAt: { gt: new Date() } },
    select: { id: true, email: true, role: true, crmAccess: true, expiresAt: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeInvitation(workspaceId: string, invitationId: string) {
  const res = await db.invitation.updateMany({
    where: { id: invitationId, workspaceId, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  if (res.count === 0) throw notFound("invitation");
}

async function findPending(token: string) {
  const inv = await db.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { workspace: { select: { id: true, name: true, slug: true } } },
  });
  if (!inv || inv.status !== "PENDING") throw notFound("invitation");
  if (inv.expiresAt <= new Date()) {
    await db.invitation.update({ where: { id: inv.id }, data: { status: "EXPIRED" } });
    throw new ApiError(410, "invitation_expired", "This invitation has expired");
  }
  return inv;
}

export async function previewInvitation(token: string) {
  const inv = await findPending(token);
  return { email: inv.email, role: inv.role, workspace: inv.workspace };
}

export async function acceptInvitation(token: string, user: { id: string; email: string }) {
  const inv = await findPending(token);
  if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new ApiError(403, "wrong_account", "This invitation was sent to a different email address");
  }
  await db.$transaction(async (tx) => {
    await tx.membership.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId: inv.workspaceId } },
      create: { userId: user.id, workspaceId: inv.workspaceId, role: inv.role, crmAccess: inv.crmAccess },
      update: {},
    });
    if (inv.projectIds.length > 0) {
      const projects = await tx.node.findMany({
        where: { id: { in: inv.projectIds }, workspaceId: inv.workspaceId, type: "PROJECT" },
        select: { id: true },
      });
      await tx.projectMember.createMany({
        data: projects.map((p) => ({ nodeId: p.id, userId: user.id, visibleToClientOnly: inv.role === "CLIENT" })),
        skipDuplicates: true,
      });
    }
    await tx.invitation.update({ where: { id: inv.id }, data: { status: "ACCEPTED" } });
  });
  return inv.workspace;
}
