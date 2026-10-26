import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { planCompanyMerge, planContactMerge, type CompanyLike, type ContactLike } from "@/modules/crm/dedupe";
import { normalizeDomain } from "@/modules/crm/normalize";
import { loadWorkspaceMember, logActivity, type Tx } from "@/server/services/nodes/access";
import { fullName, invalid } from "./common";
import { phoneKeys } from "./contacts";

export const mergeSchema = z.object({ primaryId: z.string(), duplicateIds: z.array(z.string()).min(1).max(20) });

/** Moves comments, attachments, tags and reminders of absorbed nodes onto the surviving node. */
async function moveNodeAttachments(tx: Tx, fromIds: string[], toId: string) {
  await tx.comment.updateMany({ where: { nodeId: { in: fromIds } }, data: { nodeId: toId } });
  await tx.attachment.updateMany({ where: { nodeId: { in: fromIds } }, data: { nodeId: toId } });
  await tx.reminder.updateMany({ where: { targetNodeId: { in: fromIds } }, data: { targetNodeId: toId } });
  const tags = await tx.nodeTag.findMany({ where: { nodeId: { in: fromIds } }, select: { tagId: true } });
  if (tags.length) await tx.nodeTag.createMany({ data: [...new Set(tags.map((t) => t.tagId))].map((tagId) => ({ nodeId: toId, tagId })), skipDuplicates: true });
}

async function loadSet(tx: Tx, userId: string, workspaceId: string, ids: string[], type: "CONTACT" | "COMPANY") {
  await loadWorkspaceMember(tx, userId, workspaceId, "crm:merge");
  const unique = [...new Set(ids)];
  const nodes = await tx.node.findMany({ where: { id: { in: unique }, workspaceId, type, archivedAt: null }, select: { id: true } });
  if (nodes.length !== unique.length) throw invalid("invalid_merge", `Every record must be an active ${type.toLowerCase()} of this workspace`);
}

/**
 * Merges duplicate contacts into one. The primary keeps its identity; gaps are filled and e-mails /
 * phones united (see planContactMerge). Activities, deals, comments, files, tags and consent history move
 * over, then the duplicates are deleted, so no copy of their personal data lingers.
 */
export async function mergeContacts(userId: string, workspaceId: string, input: z.infer<typeof mergeSchema>) {
  if (input.duplicateIds.includes(input.primaryId)) throw invalid("invalid_merge", "The primary record cannot also be a duplicate");
  return db.$transaction(async (tx) => {
    await loadSet(tx, userId, workspaceId, [input.primaryId, ...input.duplicateIds], "CONTACT");
    const rows = await tx.contact.findMany({ where: { nodeId: { in: [input.primaryId, ...input.duplicateIds] } } });
    const like = (r: (typeof rows)[number]): ContactLike => ({ id: r.nodeId, firstName: r.firstName, lastName: r.lastName, position: r.position, emails: r.emails, phones: r.phones, messengers: r.messengers as Record<string, string>, companyId: r.companyId, ownerId: r.ownerId, birthday: r.birthday, consentGiven: r.consentGiven, lastContactedAt: r.lastContactedAt });
    const primary = rows.find((r) => r.nodeId === input.primaryId);
    if (!primary) throw invalid("invalid_merge", "Primary record not found");
    const plan = planContactMerge(like(primary), rows.filter((r) => r.nodeId !== input.primaryId).map(like));
    const f = plan.fields;

    await tx.contact.update({
      where: { nodeId: input.primaryId },
      data: { firstName: f.firstName, lastName: f.lastName, position: f.position, emails: f.emails, phones: f.phones, phonesNorm: phoneKeys(f.phones), messengers: f.messengers as Prisma.InputJsonValue, companyId: f.companyId, ownerId: f.ownerId, birthday: f.birthday, lastContactedAt: f.lastContactedAt },
    });
    await tx.node.update({ where: { id: input.primaryId }, data: { title: fullName(f.firstName, f.lastName), parentId: f.companyId, rootId: f.companyId } });

    const gone = plan.absorbedIds;
    await tx.crmActivity.updateMany({ where: { contactId: { in: gone } }, data: { contactId: input.primaryId } });
    await tx.deal.updateMany({ where: { primaryContactId: { in: gone } }, data: { primaryContactId: input.primaryId } });
    await tx.consentRecord.updateMany({ where: { contactNodeId: { in: gone } }, data: { contactNodeId: input.primaryId } });
    await tx.leadIngest.updateMany({ where: { contactId: { in: gone } }, data: { contactId: input.primaryId } });
    await moveNodeAttachments(tx, gone, input.primaryId);
    await tx.node.deleteMany({ where: { id: { in: gone } } });
    await logActivity(tx, { workspaceId, nodeId: input.primaryId, actorId: userId, action: "contact.merged", diff: { absorbed: gone.length } });
    return { id: input.primaryId, absorbed: gone.length };
  });
}

/** Same for companies; contacts, deals, activities and client projects follow the surviving company. */
export async function mergeCompanies(userId: string, workspaceId: string, input: z.infer<typeof mergeSchema>) {
  if (input.duplicateIds.includes(input.primaryId)) throw invalid("invalid_merge", "The primary record cannot also be a duplicate");
  return db.$transaction(async (tx) => {
    await loadSet(tx, userId, workspaceId, [input.primaryId, ...input.duplicateIds], "COMPANY");
    const rows = await tx.company.findMany({ where: { nodeId: { in: [input.primaryId, ...input.duplicateIds] } } });
    const like = (r: (typeof rows)[number]): CompanyLike => ({ id: r.nodeId, legalName: r.legalName, website: r.website, industry: r.industry, size: r.size, country: r.country, city: r.city, address: r.address, taxId: r.taxId, source: r.source, ownerId: r.ownerId });
    const primary = rows.find((r) => r.nodeId === input.primaryId);
    if (!primary) throw invalid("invalid_merge", "Primary record not found");
    const plan = planCompanyMerge(like(primary), rows.filter((r) => r.nodeId !== input.primaryId).map(like));
    const gone = plan.absorbedIds;

    await tx.company.update({ where: { nodeId: input.primaryId }, data: { ...plan.fields, domain: normalizeDomain(plan.fields.website) } });
    await tx.contact.updateMany({ where: { companyId: { in: gone } }, data: { companyId: input.primaryId } });
    await tx.deal.updateMany({ where: { companyId: { in: gone } }, data: { companyId: input.primaryId } });
    await tx.node.updateMany({ where: { parentId: { in: gone } }, data: { parentId: input.primaryId, rootId: input.primaryId } });
    await tx.crmActivity.updateMany({ where: { companyId: { in: gone } }, data: { companyId: input.primaryId } });
    for (const old of gone) {
      const projects = await tx.node.findMany({ where: { workspaceId, type: "PROJECT", data: { path: ["companyId"], equals: old } }, select: { id: true, data: true } });
      for (const p of projects) await tx.node.update({ where: { id: p.id }, data: { data: { ...(p.data as Record<string, unknown>), companyId: input.primaryId } as Prisma.InputJsonValue } });
    }
    await moveNodeAttachments(tx, gone, input.primaryId);
    await tx.node.deleteMany({ where: { id: { in: gone } } });
    await logActivity(tx, { workspaceId, nodeId: input.primaryId, actorId: userId, action: "company.merged", diff: { absorbed: gone.length } });
    return { id: input.primaryId, absorbed: gone.length };
  });
}
