import { z } from "zod";
import type { AgentDraft, AgentDraftStatus, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { conflict, notFound } from "@/server/http/errors";
import { CHANNEL_LABEL, openChatUrl } from "@/modules/crm/draft-links";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { createActivityIn } from "./activities";
import { fullName, invalid } from "./common";

/** The agent's own rows carry this in `source`, like everything else it writes. */
const SOURCE = "agent";
const CONSENT_TASK = "[агент] Получить согласие";
/** A draft that nobody has sent or rejected yet. */
const OPEN: AgentDraftStatus[] = ["PENDING", "APPROVED"];

export const createDraftSchema = z.object({
  contactId: z.string().min(1),
  channel: z.enum(["TELEGRAM", "WHATSAPP", "INSTAGRAM"]).default("TELEGRAM"),
  text: z.string().trim().min(1).max(4000),
  reason: z.string().trim().max(300).nullable().optional(),
});
export const editDraftSchema = z.object({ text: z.string().trim().min(1).max(4000) });
export const listDraftsSchema = z.object({ status: z.enum(["PENDING", "APPROVED", "REJECTED", "SENT"]).optional() });

export type CreateDraftResult =
  | { kind: "draft"; draft: AgentDraft }
  /** The contact has not given consent: no draft, an open task "get consent" instead (the same one if it already exists). */
  | { kind: "consent_required"; taskId: string; created: boolean };

/**
 * The agent's only way to produce a message. For a contact without `consentGiven` nothing is drafted:
 * the person gets a task to ask for consent first.
 */
export async function createAgentDraft(userId: string, workspaceId: string, input: z.infer<typeof createDraftSchema>): Promise<CreateDraftResult> {
  return db.$transaction(async (tx) => {
    await loadWorkspaceMember(tx, userId, workspaceId, "crm:write");
    const c = await tx.contact.findFirst({ where: { nodeId: input.contactId, workspaceId, node: { archivedAt: null } }, select: { firstName: true, lastName: true, consentGiven: true } });
    if (!c) throw invalid("invalid_contact", "Contact not found in this workspace");
    if (!c.consentGiven) {
      const open = await tx.crmActivity.findFirst({ where: { workspaceId, contactId: input.contactId, type: "TASK", completedAt: null, subject: { startsWith: CONSENT_TASK } }, select: { id: true } });
      if (open) return { kind: "consent_required", taskId: open.id, created: false };
      const task = await createActivityIn(
        tx,
        userId,
        workspaceId,
        { type: "TASK", subject: `${CONSENT_TASK}: ${fullName(c.firstName, c.lastName)}`, body: "Черновик не создан: в карточке нет согласия на контакт. Сначала личное сообщение без продажи.", contactId: input.contactId },
        { source: SOURCE },
      );
      return { kind: "consent_required", taskId: task.id, created: true };
    }
    const draft = await tx.agentDraft.create({ data: { workspaceId, userId, contactId: input.contactId, channel: input.channel, text: input.text, reason: input.reason ?? null } });
    return { kind: "draft", draft };
  });
}

export async function listAgentDrafts(userId: string, workspaceId: string, f: z.infer<typeof listDraftsSchema>) {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const where: Prisma.AgentDraftWhereInput = { workspaceId, userId, contact: { node: { archivedAt: null } }, status: f.status ?? { in: OPEN } };
  const rows = await db.agentDraft.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, include: { contact: { select: { firstName: true, lastName: true, consentGiven: true, messengers: true } } } });
  return {
    total: rows.length,
    items: rows.map((d) => ({
      id: d.id,
      contactId: d.contactId,
      contactName: fullName(d.contact.firstName, d.contact.lastName),
      consentGiven: d.contact.consentGiven,
      channel: d.channel,
      text: d.text,
      status: d.status,
      reason: d.reason,
      createdAt: d.createdAt,
      /** Null when the card has no handle for the channel: the text can still be copied. */
      openUrl: openChatUrl(d.channel, d.contact.messengers),
    })),
  };
}

/** Only the person the draft belongs to may act on it; anyone else sees "not found". */
async function ownDraft(tx: Prisma.TransactionClient, userId: string, id: string) {
  const d = await tx.agentDraft.findFirst({ where: { id, userId } });
  if (!d) throw notFound("draft");
  await loadWorkspaceMember(tx, userId, d.workspaceId, "crm:write");
  return d;
}

const settled = () => conflict("draft_settled", "This draft was already sent or rejected");

/** Saving an edit means the person has read it and stands behind the text: PENDING → APPROVED. */
export async function editAgentDraft(userId: string, id: string, input: z.infer<typeof editDraftSchema>) {
  return db.$transaction(async (tx) => {
    const d = await ownDraft(tx, userId, id);
    const r = await tx.agentDraft.updateMany({ where: { id: d.id, status: { in: OPEN } }, data: { text: input.text, status: "APPROVED" } });
    if (r.count === 0) throw settled();
    return tx.agentDraft.findUniqueOrThrow({ where: { id: d.id } });
  });
}

export async function rejectAgentDraft(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const d = await ownDraft(tx, userId, id);
    const r = await tx.agentDraft.updateMany({ where: { id: d.id, status: { in: OPEN } }, data: { status: "REJECTED" } });
    if (r.count === 0) throw settled();
    return tx.agentDraft.findUniqueOrThrow({ where: { id: d.id } });
  });
}

/**
 * "Copy" was pressed: the person takes the text to the messenger. The draft becomes SENT and a MESSAGE is logged on the contact,
 * in one transaction. The status flip is conditional, so a double click logs one message, not two.
 * Consent is checked again: it may have been withdrawn since the draft was written.
 */
export async function markAgentDraftSent(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const d = await ownDraft(tx, userId, id);
    const c = await tx.contact.findUniqueOrThrow({ where: { nodeId: d.contactId }, select: { consentGiven: true } });
    if (!c.consentGiven) throw invalid("consent_required", "The contact has no consent any more");
    const r = await tx.agentDraft.updateMany({ where: { id: d.id, status: { in: OPEN } }, data: { status: "SENT" } });
    if (r.count === 0) throw settled();
    await createActivityIn(
      tx,
      userId,
      d.workspaceId,
      { type: "MESSAGE", subject: `Сообщение отправлено через ${CHANNEL_LABEL[d.channel]}`, body: d.text, contactId: d.contactId, completed: true },
      { source: SOURCE },
    );
    return tx.agentDraft.findUniqueOrThrow({ where: { id: d.id } });
  });
}
