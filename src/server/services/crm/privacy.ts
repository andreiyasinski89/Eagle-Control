import { z } from "zod";
import { db } from "@/server/db";
import { forbidden } from "@/server/http/errors";
import { can } from "@/server/policies";
import { loadWorkspaceMember, logActivity } from "@/server/services/nodes/access";

export const privacySchema = z.object({ mode: z.enum(["PRIVATE", "OPEN"]) });

/** Who sees other people's contacts in this workspace, and whether the asker may change it. */
export async function getContactPrivacy(userId: string, workspaceId: string) {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const w = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { contactPrivacy: true } });
  return { mode: w.contactPrivacy, canChange: can(m, "billing:manage") };
}

/**
 * Private (the default): nobody sees another person's contacts, whatever their role; the people above see numbers. Open: owners, admins and
 * members with the whole CRM see everyone's. Only the owner of the workspace decides, and the change is written down.
 */
export async function setContactPrivacy(userId: string, workspaceId: string, mode: z.infer<typeof privacySchema>["mode"]) {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  if (!can(m, "billing:manage")) throw forbidden();
  const before = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { contactPrivacy: true } });
  if (before.contactPrivacy === mode) return { mode, canChange: true };
  await db.$transaction(async (tx) => {
    await tx.workspace.update({ where: { id: workspaceId }, data: { contactPrivacy: mode } });
    await logActivity(tx, { workspaceId, nodeId: null, actorId: userId, action: "workspace.contact_privacy", diff: { from: before.contactPrivacy, to: mode } });
  });
  return { mode, canChange: true };
}
