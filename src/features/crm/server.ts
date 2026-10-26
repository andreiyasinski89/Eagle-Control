import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/server/policies";

/** What every CRM page needs from the server: who is asking and what they may do. */
export async function crmContext(slug: string) {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const membership = await db.membership.findFirst({ where: { userId, workspace: { slug } }, include: { workspace: { select: { id: true } } } });
  if (!membership || !can(membership, "crm:read")) notFound();
  return {
    userId,
    slug,
    workspaceId: membership.workspace.id,
    canWrite: can(membership, "crm:write"),
    canExport: can(membership, "crm:export"),
    canMerge: can(membership, "crm:merge"),
    canErase: can(membership, "crm:erase"),
    canManageLeads: can(membership, "leadform:manage"),
    canManagePipelines: can(membership, "pipeline:manage"),
  };
}
