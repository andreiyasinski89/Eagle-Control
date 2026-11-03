import { db } from "@/server/db";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { fullName } from "./common";
import { setConsent } from "./contacts";

/** What the record says: the account owner vouches for consent that was given outside the app. */
export const ATTESTED_SOURCE = "owner_attestation";

export interface BulkConsentPlan {
  /** Contacts that get consent now. */
  toSet: { id: string; name: string }[];
  /** People who withdrew consent earlier: never switched back on in bulk. */
  skippedRevoked: { id: string; name: string }[];
  alreadyGiven: number;
}

/**
 * Marks consent as given for the owner's contacts that have none, one auditable ConsentRecord each
 * (source "owner_attestation"). Someone who once withdrew consent is left alone. Without `apply` nothing is written.
 */
export async function bulkAttestConsent(userId: string, workspaceId: string, opts: { ownerId?: string; apply: boolean }): Promise<BulkConsentPlan & { applied: number }> {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:write");
  const rows = await db.contact.findMany({
    where: { workspaceId, node: { archivedAt: null }, ...(opts.ownerId ? { ownerId: opts.ownerId } : {}) },
    select: { nodeId: true, firstName: true, lastName: true, consentGiven: true },
    orderBy: { firstName: "asc" },
  });
  const withdrawn = new Set((await db.consentRecord.findMany({ where: { contactNodeId: { in: rows.map((r) => r.nodeId) }, revokedAt: { not: null } }, select: { contactNodeId: true } })).map((c) => c.contactNodeId));
  const plan: BulkConsentPlan = { toSet: [], skippedRevoked: [], alreadyGiven: 0 };
  for (const r of rows) {
    const who = { id: r.nodeId, name: fullName(r.firstName, r.lastName) };
    if (r.consentGiven) plan.alreadyGiven++;
    else if (withdrawn.has(r.nodeId)) plan.skippedRevoked.push(who);
    else plan.toSet.push(who);
  }
  let applied = 0;
  if (opts.apply) {
    for (const c of plan.toSet) {
      await setConsent(userId, c.id, true, ATTESTED_SOURCE);
      applied++;
    }
  }
  return { ...plan, applied };
}
