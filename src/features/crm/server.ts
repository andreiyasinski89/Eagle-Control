import { notFound } from "next/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/server/policies";

/** What every CRM page needs from the server: who is asking and what they may do. */
/** `full`: the page is for those who see the whole CRM (deals, companies, reports); a member who sees only their people gets a 404. */
export async function crmContext(slug: string, full = false) {
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const membership = await db.membership.findFirst({ where: { userId, workspace: { slug } }, include: { workspace: { select: { id: true } } } });
  if (!membership || !can(membership, "crm:read") || (full && !can(membership, "crm:full"))) notFound();
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
    /** Owners and admins: they make the scripts of the whole team. */
    canLead: can(membership, "workspace:update"),
  };
}
