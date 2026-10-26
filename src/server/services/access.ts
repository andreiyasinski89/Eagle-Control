import type { Membership } from "@prisma/client";
import { db } from "@/server/db";
import { can, type Action } from "@/server/policies";
import { forbidden, notFound } from "@/server/http/errors";

/** 404 (not 403) for non-members so workspace ids don't leak. */
export async function requireMember(userId: string, workspaceId: string): Promise<Membership> {
  const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  if (!m) throw notFound("workspace");
  return m;
}

export async function requireCan(userId: string, workspaceId: string, action: Action): Promise<Membership> {
  const m = await requireMember(userId, workspaceId);
  if (!can(m, action)) throw forbidden();
  return m;
}
