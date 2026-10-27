import type { Role } from "@prisma/client";
import { db } from "@/server/db";
import { ApiError, forbidden, notFound } from "@/server/http/errors";
import { crmLevel, levelFields, type CrmLevel } from "@/modules/crm/access";
import { canManageMember } from "@/server/policies";
import { logActivity } from "@/server/services/nodes/access";

export function listMembers(workspaceId: string) {
  return db.membership.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true, email: true, avatar: true, image: true } } },
    orderBy: { createdAt: "asc" },
  });
}

async function ownerCount(workspaceId: string): Promise<number> {
  return db.membership.count({ where: { workspaceId, role: "OWNER" } });
}

const levelOf = (m: { role: Role; crmAccess: boolean; crmScope: "OWN" | "TEAM" | "ALL" }) => crmLevel(m);

const lastOwner = () => new ApiError(409, "last_owner", "A workspace needs at least one owner");

export async function updateMember(
  actor: { userId: string; role: Role },
  workspaceId: string,
  targetUserId: string,
  patch: { role?: Role; crmAccess?: boolean; crmLevel?: CrmLevel; hourlyRate?: number | null },
) {
  const target = await db.membership.findUnique({
    where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
  });
  if (!target) throw notFound("member");
  if (!canManageMember(actor.role, target.role, patch.role)) throw forbidden();
  if (target.role === "OWNER" && patch.role && patch.role !== "OWNER" && (await ownerCount(workspaceId)) <= 1) {
    throw lastOwner();
  }
  const { crmLevel, ...rest } = patch;
  const data = crmLevel ? { ...rest, ...levelFields(crmLevel) } : rest;
  const updated = await db.membership.update({ where: { id: target.id }, data });
  if (crmLevel && crmLevel !== levelOf(target)) await logActivity(db, { workspaceId, nodeId: null, actorId: actor.userId, action: "member.crm_level", diff: { userId: targetUserId, from: levelOf(target), to: crmLevel } });
  return updated;
}

export async function removeMember(
  actor: { userId: string; role: Role },
  workspaceId: string,
  targetUserId: string,
) {
  const target = await db.membership.findUnique({
    where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
  });
  if (!target) throw notFound("member");
  const leaving = actor.userId === targetUserId;
  if (!leaving && !canManageMember(actor.role, target.role)) throw forbidden();
  if (target.role === "OWNER" && (await ownerCount(workspaceId)) <= 1) throw lastOwner();
  await db.membership.delete({ where: { id: target.id } });
}
