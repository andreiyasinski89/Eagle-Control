import { z } from "zod";
import type { CrmActivityType, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { notFound } from "@/server/http/errors";
import { can } from "@/server/policies";
import { loadWorkspaceMember, type Tx } from "@/server/services/nodes/access";
import { assertWorkspaceMember, invalid, pageArgs, toDate } from "./common";
import { contactScope, contactVisible } from "./scope";
import { refreshTemperature } from "./temperature";

export const activitySchema = z.object({
  type: z.enum(["CALL", "EMAIL", "MEETING", "NOTE", "TASK", "MESSAGE"]),
  subject: z.string().trim().min(1).max(200),
  body: z.string().max(10_000).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  /** Minutes a scheduled call or meeting lasts; shown as its length in the calendar. */
  durationMin: z.number().int().min(5).max(1440).nullable().optional(),
  /** Force done / not done; by default logged calls, e-mails, notes… are done, tasks and future items are open. */
  completed: z.boolean().optional(),
  contactId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  dealId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
});
export type ActivityInput = z.infer<typeof activitySchema>;
export const patchActivitySchema = activitySchema.partial().refine((v) => Object.keys(v).length > 0, "Nothing to update");

const TOUCH_TYPES: CrmActivityType[] = ["CALL", "EMAIL", "MEETING", "MESSAGE"];

/** A completed activity keeps the relationship "warm": it resets the deal's idle clock and the contact's last touch. */
async function recordTouch(tx: Tx, a: { type: CrmActivityType; contactId: string | null; dealId: string | null }, at: Date) {
  if (a.dealId) await tx.deal.update({ where: { nodeId: a.dealId }, data: { lastActivityAt: at } });
  if (a.contactId && TOUCH_TYPES.includes(a.type)) {
    await tx.contact.update({ where: { nodeId: a.contactId }, data: { lastContactedAt: at } });
    await refreshTemperature(tx, a.contactId, at);
  }
}

async function resolveLinks(tx: Tx, workspaceId: string, input: Pick<ActivityInput, "contactId" | "companyId" | "dealId">) {
  const dealId = input.dealId ?? null;
  let contactId = input.contactId ?? null;
  let companyId = input.companyId ?? null;
  if (dealId) {
    const d = await tx.deal.findFirst({ where: { nodeId: dealId, workspaceId } });
    if (!d) throw invalid("invalid_deal", "Deal not found in this workspace");
    contactId ??= d.primaryContactId;
    companyId ??= d.companyId;
  }
  if (contactId) {
    const c = await tx.contact.findFirst({ where: { nodeId: contactId, workspaceId } });
    if (!c) throw invalid("invalid_contact", "Contact not found in this workspace");
    companyId ??= c.companyId;
  }
  if (companyId) {
    const c = await tx.company.findFirst({ where: { nodeId: companyId, workspaceId } });
    if (!c) throw invalid("invalid_company", "Company not found in this workspace");
  }
  return { contactId, companyId, dealId };
}

export async function createActivityIn(tx: Tx, userId: string, workspaceId: string, input: ActivityInput) {
  await assertWorkspaceMember(tx, workspaceId, input.ownerId);
  const links = await resolveLinks(tx, workspaceId, input);
  const now = new Date();
  const dueAt = toDate(input.dueAt);
  const done = input.completed ?? (input.type === "TASK" ? false : dueAt === null || dueAt <= now);
  const a = await tx.crmActivity.create({
    data: {
      workspaceId,
      type: input.type,
      subject: input.subject,
      body: input.body ?? null,
      dueAt,
      durationMin: input.durationMin ?? null,
      completedAt: done ? now : null,
      ownerId: input.ownerId ?? userId,
      ...links,
    },
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  if (done) await recordTouch(tx, a, now);
  return a;
}

/** A member who sees only their people may write about those people alone: no deals, no companies, nobody else's contacts. */
async function assertLinksVisible(tx: Tx, m: Parameters<typeof contactVisible>[1], links: { contactId?: string | null; companyId?: string | null; dealId?: string | null }, write = true) {
  if (can(m, "crm:full")) return;
  if (!links.contactId || !(await contactVisible(tx, m, links.contactId, { write }))) throw notFound("contact");
}

export async function createActivity(userId: string, workspaceId: string, input: ActivityInput) {
  return db.$transaction(async (tx) => {
    const m = await loadWorkspaceMember(tx, userId, workspaceId, "crm:write");
    if (!can(m, "crm:full") && (input.dealId || input.companyId)) throw notFound("contact");
    await assertLinksVisible(tx, m, input);
    return createActivityIn(tx, userId, workspaceId, input);
  });
}

async function loadActivity(tx: Tx, userId: string, id: string, action: "crm:read" | "crm:write") {
  const a = await tx.crmActivity.findUnique({ where: { id } });
  if (!a) throw notFound("activity");
  const m = await loadWorkspaceMember(tx, userId, a.workspaceId, action);
  await assertLinksVisible(tx, m, { contactId: a.contactId }, action === "crm:write");
  return a;
}

export async function updateActivity(userId: string, id: string, patch: z.infer<typeof patchActivitySchema>) {
  return db.$transaction(async (tx) => {
    const cur = await loadActivity(tx, userId, id, "crm:write");
    await assertWorkspaceMember(tx, cur.workspaceId, patch.ownerId);
    const links = await resolveLinks(tx, cur.workspaceId, {
      contactId: patch.contactId !== undefined ? patch.contactId : cur.contactId,
      companyId: patch.companyId !== undefined ? patch.companyId : cur.companyId,
      dealId: patch.dealId !== undefined ? patch.dealId : cur.dealId,
    });
    if (patch.contactId !== undefined || patch.dealId !== undefined || patch.companyId !== undefined) {
      const m = await loadWorkspaceMember(tx, userId, cur.workspaceId, "crm:write");
      if (!can(m, "crm:full") && (patch.dealId || patch.companyId)) throw notFound("contact");
      await assertLinksVisible(tx, m, { contactId: links.contactId });
    }
    const now = new Date();
    const data: Prisma.CrmActivityUncheckedUpdateInput = { ...links };
    if (patch.type !== undefined) data.type = patch.type;
    if (patch.subject !== undefined) data.subject = patch.subject;
    if (patch.body !== undefined) data.body = patch.body;
    if (patch.dueAt !== undefined) data.dueAt = toDate(patch.dueAt);
    if (patch.durationMin !== undefined) data.durationMin = patch.durationMin;
    if (patch.ownerId) data.ownerId = patch.ownerId;
    if (patch.completed !== undefined) data.completedAt = patch.completed ? (cur.completedAt ?? now) : null;
    const a = await tx.crmActivity.update({ where: { id }, data, include: { owner: { select: { id: true, name: true, email: true } } } });
    if (patch.completed && !cur.completedAt) await recordTouch(tx, a, now);
    return a;
  });
}

export async function deleteActivity(userId: string, id: string) {
  await db.$transaction(async (tx) => {
    const a = await loadActivity(tx, userId, id, "crm:write");
    await tx.crmActivity.delete({ where: { id } });
    // A touch that is taken back must not leave the person looking as if they had been written to: the last touch goes back to the one before it.
    if (a.contactId && TOUCH_TYPES.includes(a.type) && a.completedAt) {
      const last = await tx.crmActivity.findFirst({ where: { contactId: a.contactId, type: { in: TOUCH_TYPES }, completedAt: { not: null } }, orderBy: { completedAt: "desc" }, select: { completedAt: true } });
      await tx.contact.update({ where: { nodeId: a.contactId }, data: { lastContactedAt: last?.completedAt ?? null } });
      await refreshTemperature(tx, a.contactId, new Date());
    }
  });
}

export const listActivitiesSchema = z.object({
  contactId: z.string().optional(),
  companyId: z.string().optional(),
  dealId: z.string().optional(),
  ownerId: z.string().optional(),
  type: z.enum(["CALL", "EMAIL", "MEETING", "NOTE", "TASK", "MESSAGE"]).optional(),
  status: z.enum(["open", "done", "overdue"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export async function listActivities(userId: string, workspaceId: string, f: z.infer<typeof listActivitiesSchema>) {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const scope = await contactScope(db, m);
  const now = new Date();
  const where: Prisma.CrmActivityWhereInput = {
    workspaceId,
    ...(scope ? { contactId: { not: null }, contact: scope } : {}),
    ...(f.contactId ? { contactId: f.contactId } : {}),
    ...(f.companyId ? { companyId: f.companyId } : {}),
    ...(f.dealId ? { dealId: f.dealId } : {}),
    ...(f.ownerId ? { ownerId: f.ownerId } : {}),
    ...(f.type ? { type: f.type } : {}),
    ...(f.status === "done" ? { completedAt: { not: null } } : f.status === "open" ? { completedAt: null } : f.status === "overdue" ? { completedAt: null, dueAt: { lt: now } } : {}),
  };
  const { skip, take, page, pageSize } = pageArgs(f);
  const [total, items] = await Promise.all([
    db.crmActivity.count({ where }),
    db.crmActivity.findMany({
      where,
      skip,
      take,
      orderBy: [{ completedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
      include: { owner: { select: { id: true, name: true, email: true } }, contact: { select: { firstName: true, lastName: true } }, company: { select: { legalName: true } }, deal: { select: { node: { select: { title: true } } } } },
    }),
  ]);
  return {
    total,
    page,
    pageSize,
    items: items.map((a) => ({
      id: a.id,
      type: a.type,
      subject: a.subject,
      body: a.body,
      dueAt: a.dueAt,
      durationMin: a.durationMin,
      completedAt: a.completedAt,
      createdAt: a.createdAt,
      owner: a.owner,
      contactId: a.contactId,
      contactName: a.contact ? [a.contact.firstName, a.contact.lastName].filter(Boolean).join(" ") : null,
      companyId: a.companyId,
      companyName: a.company?.legalName ?? null,
      dealId: a.dealId,
      dealTitle: a.deal?.node.title ?? null,
    })),
  };
}
