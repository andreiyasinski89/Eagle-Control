import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { ApiError, limitReached } from "@/server/http/errors";
import { checkLimit } from "@/modules/plans";
import { contactKeys, findDuplicateGroups } from "@/modules/crm/dedupe";
import { parsePriority, PRIORITIES, STAGES, TEMPERATURES } from "@/modules/crm/people";
import { normalizeEmail, normalizePhone, uniqueNonNull } from "@/modules/crm/normalize";
import { loadWorkspaceMember, logActivity, type Tx } from "@/server/services/nodes/access";
import { contactScope, withScope } from "./scope";
import { deleteObject } from "@/server/storage";
import { assertWorkspaceMember, fullName, invalid, loadCrmNode, pageArgs, toDate } from "./common";
import { assertGroup } from "./groups";
import { assertPartnerLinks, listTransfers } from "./partners";
import { autoPlan } from "./stage-rules";

const text = (max: number) => z.string().trim().max(max).nullable().optional();
/** Travel or business: the team's letters (П, Б) and words are accepted and stored as the code. */
export const priorityField = z.preprocess((v) => (typeof v === "string" ? (v.trim() === "" ? null : (parsePriority(v) ?? v)) : v), z.enum(PRIORITIES).nullable().optional());

export const contactFieldsSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: text(100),
  position: text(100),
  emails: z.array(z.string().trim().max(200)).max(10).default([]),
  phones: z.array(z.string().trim().max(40)).max(10).default([]),
  messengers: z.object({ telegram: text(100), whatsapp: text(100), instagram: text(100) }).partial().default({}),
  companyId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  birthday: z.string().date().nullable().optional(),
  source: text(80),
  // The person in a funnel.
  stage: z.enum(STAGES).optional(),
  temperature: z.enum(TEMPERATURES).nullable().optional(),
  interests: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  influence: z.number().int().min(0).max(100).nullable().optional(),
  nextStep: text(200),
  nextStepAt: z.string().datetime().nullable().optional(),
  typeTag: priorityField,
  country: text(80),
  sponsorName: text(120),
  groupId: z.string().nullable().optional(),
  sponsorId: z.string().nullable().optional(),
  linkedUserId: z.string().nullable().optional(),
});
export const createContactSchema = contactFieldsSchema.extend({ allowDuplicate: z.boolean().default(false), consentGiven: z.boolean().default(false) });
export const patchContactSchema = contactFieldsSchema.partial().refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type ContactFields = z.infer<typeof contactFieldsSchema>;

export function cleanEmails(list: readonly string[]): string[] {
  return uniqueNonNull(list.map(normalizeEmail));
}
export function phoneKeys(list: readonly string[]): string[] {
  return uniqueNonNull(list.map(normalizePhone));
}

/** Active contacts that share an e-mail or phone with the given ones. */
export async function findContactMatches(tx: Tx, workspaceId: string, emails: readonly string[], phones: readonly string[], ignoreId?: string) {
  const e = cleanEmails(emails);
  const p = phoneKeys(phones);
  if (e.length === 0 && p.length === 0) return [];
  const rows = await tx.contact.findMany({
    where: {
      workspaceId,
      node: { archivedAt: null },
      ...(ignoreId ? { nodeId: { not: ignoreId } } : {}),
      OR: [...(e.length ? [{ emails: { hasSome: e } }] : []), ...(p.length ? [{ phonesNorm: { hasSome: p } }] : [])],
    },
    select: { nodeId: true, firstName: true, lastName: true, emails: true },
  });
  return rows.map((r) => ({ id: r.nodeId, name: fullName(r.firstName, r.lastName), emails: r.emails }));
}

/** Parent in the CRM tree: the contact hangs under its company, if any. */
async function placement(tx: Tx, workspaceId: string, companyId: string | null | undefined) {
  if (!companyId) return { parentId: null, rootId: null };
  const co = await tx.node.findUnique({ where: { id: companyId } });
  if (!co || co.type !== "COMPANY" || co.workspaceId !== workspaceId || co.archivedAt) throw invalid("invalid_company", "Company not found in this workspace");
  return { parentId: co.id, rootId: co.id };
}

export async function assertContactCapacity(tx: Tx, workspaceId: string, adding: number): Promise<void> {
  const ws = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { plan: true } });
  const count = await tx.contact.count({ where: { workspaceId, node: { archivedAt: null } } });
  const check = checkLimit(ws.plan, "contacts", count, adding);
  if (!check.allowed) throw limitReached(check.limit, "contacts");
}

/** The funnel fields a person can carry, as given by the API, the import or the quick add. */
export interface Funnel {
  stage?: (typeof STAGES)[number];
  temperature?: (typeof TEMPERATURES)[number] | null;
  interests?: string[];
  source?: string | null;
  influence?: number | null;
  nextStep?: string | null;
  nextStepAt?: string | null;
  typeTag?: string | null;
  country?: string | null;
  sponsorName?: string | null;
  groupId?: string | null;
  sponsorId?: string | null;
  linkedUserId?: string | null;
  ownerId?: string | null;
}

const blank = (v: string | null | undefined) => (v === undefined ? undefined : v === null || v.trim() === "" ? null : v.trim());

/** What goes into the contact row for the funnel fields that were given (the rest keep their defaults). */
function funnelData(f: Funnel): Partial<Prisma.ContactUncheckedCreateInput> {
  const out: Record<string, unknown> = {};
  if (f.stage) out.stage = f.stage;
  if (f.temperature !== undefined) out.temperature = f.temperature;
  if (f.interests !== undefined) out.interests = f.interests;
  if (f.source !== undefined) out.source = blank(f.source) ?? null;
  if (f.influence !== undefined) out.influence = f.influence;
  if (f.nextStep !== undefined) out.nextStep = blank(f.nextStep) ?? null;
  if (f.nextStepAt !== undefined) out.nextStepAt = f.nextStepAt ? new Date(f.nextStepAt) : null;
  if (f.typeTag !== undefined) out.typeTag = f.typeTag ? (parsePriority(f.typeTag) ?? blank(f.typeTag) ?? null) : null;
  if (f.country !== undefined) out.country = blank(f.country) ?? null;
  if (f.sponsorName !== undefined) out.sponsorName = blank(f.sponsorName) ?? null;
  if (f.groupId !== undefined) out.groupId = f.groupId;
  if (f.sponsorId !== undefined) out.sponsorId = f.sponsorId;
  if (f.linkedUserId !== undefined) out.linkedUserId = f.linkedUserId;
  return out as Partial<Prisma.ContactUncheckedCreateInput>;
}

export async function createContactIn(
  tx: Tx,
  userId: string,
  workspaceId: string,
  input: ContactFields & { consentGiven?: boolean; consentSource?: string },
): Promise<{ id: string }> {
  await assertWorkspaceMember(tx, workspaceId, input.ownerId);
  await assertGroup(tx, workspaceId, input.groupId);
  await assertPartnerLinks(tx, workspaceId, null, input);
  const { parentId, rootId } = await placement(tx, workspaceId, input.companyId);
  const emails = cleanEmails(input.emails);
  const node = await tx.node.create({
    data: { workspaceId, type: "CONTACT", title: fullName(input.firstName, input.lastName), parentId, rootId, createdById: userId, position: Date.now(), data: {} },
  });
  const messengers = Object.fromEntries(Object.entries(input.messengers ?? {}).filter(([, v]) => !!v));
  await tx.contact.create({
    data: {
      nodeId: node.id,
      workspaceId,
      firstName: input.firstName,
      lastName: input.lastName?.trim() || null,
      position: input.position?.trim() || null,
      emails,
      phones: input.phones.map((p) => p.trim()).filter(Boolean),
      phonesNorm: phoneKeys(input.phones),
      messengers: messengers as Prisma.InputJsonValue,
      companyId: parentId,
      ownerId: input.ownerId ?? userId,
      birthday: input.birthday ? new Date(input.birthday) : null,
      consentGiven: input.consentGiven ?? false,
      consentAt: input.consentGiven ? new Date() : null,
      ...funnelData(input),
    },
  });
  await tx.contactStageEvent.create({ data: { contactNodeId: node.id, workspaceId, fromStage: null, toStage: input.stage ?? "NEW", actorId: userId } });
  if (input.consentGiven) {
    await tx.consentRecord.create({ data: { contactNodeId: node.id, purpose: "contact", givenAt: new Date(), source: input.consentSource ?? "manual" } });
  }
  await logActivity(tx, { workspaceId, nodeId: node.id, actorId: userId, action: "contact.created", diff: { name: node.title } });
  return { id: node.id };
}

export interface BulkContact {
  firstName: string;
  lastName: string | null;
  position: string | null;
  emails: string[];
  phones: string[];
  messengers: Record<string, string>;
  companyId?: string;
  /** Becomes a NOTE activity on the contact. */
  note?: string | null;
  /** Where the person stands in the funnel, and the rest of what is known about them. */
  funnel?: Funnel;
}

const BULK_CHUNK = 500;

/**
 * Creates many contacts with a handful of statements instead of several per person (an import of a few hundred people
 * otherwise spends minutes waiting on a remote database). Same rows as `createContactIn`: node, contact, optional note, audit entry.
 * Ids are made here, so each row can be linked to the others without reading anything back.
 */
export async function createContactsBulk(tx: Tx, userId: string, workspaceId: string, rows: readonly BulkContact[]): Promise<string[]> {
  if (rows.length === 0) return [];
  const companyIds = [...new Set(rows.map((r) => r.companyId).filter((c): c is string => !!c))];
  if (companyIds.length) {
    const found = await tx.node.count({ where: { id: { in: companyIds }, workspaceId, type: "COMPANY", archivedAt: null } });
    if (found !== companyIds.length) throw invalid("invalid_company", "Company not found in this workspace");
  }
  const ids = rows.map(() => randomUUID());
  const base = Date.now();
  const now = new Date();
  for (let i = 0; i < rows.length; i += BULK_CHUNK) {
    const part = rows.slice(i, i + BULK_CHUNK);
    const nodeIds = ids.slice(i, i + BULK_CHUNK);
    const title = (r: BulkContact) => fullName(r.firstName, r.lastName);
    await tx.node.createMany({ data: part.map((r, k) => ({ id: nodeIds[k] as string, workspaceId, type: "CONTACT" as const, title: title(r), parentId: r.companyId ?? null, rootId: r.companyId ?? null, createdById: userId, position: base + i + k, data: {} })) });
    await tx.contact.createMany({
      data: part.map((r, k) => ({
        nodeId: nodeIds[k] as string,
        workspaceId,
        firstName: r.firstName,
        lastName: r.lastName?.trim() || null,
        position: r.position?.trim() || null,
        emails: cleanEmails(r.emails),
        phones: r.phones.map((p) => p.trim()).filter(Boolean),
        phonesNorm: phoneKeys(r.phones),
        messengers: Object.fromEntries(Object.entries(r.messengers).filter(([, v]) => !!v)) as Prisma.InputJsonValue,
        companyId: r.companyId ?? null,
        ownerId: r.funnel?.ownerId ?? userId,
        consentGiven: false,
        ...funnelData(r.funnel ?? {}),
      })),
    });
    await tx.contactStageEvent.createMany({ data: part.map((r, k) => ({ contactNodeId: nodeIds[k] as string, workspaceId, fromStage: null, toStage: r.funnel?.stage ?? "NEW", actorId: userId })) });
    const notes = part.flatMap((r, k) => (r.note ? [{ workspaceId, type: "NOTE" as const, subject: "Imported note", body: r.note, ownerId: userId, contactId: nodeIds[k] as string, companyId: r.companyId ?? null, completedAt: now }] : []));
    if (notes.length) await tx.crmActivity.createMany({ data: notes });
    await tx.activityLog.createMany({ data: part.map((r, k) => ({ workspaceId, nodeId: nodeIds[k] as string, actorId: userId, action: "contact.created", diff: { name: title(r) } as Prisma.InputJsonValue })) });
  }
  return ids;
}

export async function createContact(userId: string, workspaceId: string, input: z.infer<typeof createContactSchema>) {
  return db.$transaction(async (tx) => {
    await loadWorkspaceMember(tx, userId, workspaceId, "crm:write");
    await assertContactCapacity(tx, workspaceId, 1);
    if (!input.allowDuplicate) {
      const matches = await findContactMatches(tx, workspaceId, input.emails, input.phones);
      if (matches.length) throw new ApiError(409, "duplicate_contact", "This person may already exist", { candidates: matches });
    }
    const { id } = await createContactIn(tx, userId, workspaceId, input);
    return getContactIn(tx, userId, id);
  });
}

export async function updateContactIn(tx: Tx, userId: string, contactId: string, patch: z.infer<typeof patchContactSchema>) {
  const node = await loadCrmNode(tx, userId, contactId, "CONTACT", true);
  const cur = await tx.contact.findUniqueOrThrow({ where: { nodeId: contactId } });
  await assertWorkspaceMember(tx, node.workspaceId, patch.ownerId);
  await assertGroup(tx, node.workspaceId, patch.groupId);
  await assertPartnerLinks(tx, node.workspaceId, contactId, patch);
  const data: Prisma.ContactUncheckedUpdateInput = {};
  if (patch.firstName !== undefined) data.firstName = patch.firstName;
  if (patch.lastName !== undefined) data.lastName = patch.lastName?.trim() || null;
  if (patch.position !== undefined) data.position = patch.position?.trim() || null;
  if (patch.emails !== undefined) data.emails = cleanEmails(patch.emails);
  if (patch.phones !== undefined) {
    data.phones = patch.phones.map((p) => p.trim()).filter(Boolean);
    data.phonesNorm = phoneKeys(patch.phones);
  }
  if (patch.messengers !== undefined) {
    data.messengers = Object.fromEntries(Object.entries({ ...(cur.messengers as Record<string, string>), ...patch.messengers }).filter(([, v]) => !!v)) as Prisma.InputJsonValue;
  }
  if (patch.ownerId !== undefined) data.ownerId = patch.ownerId;
  if (patch.birthday !== undefined) data.birthday = toDate(patch.birthday);
  Object.assign(data, funnelData(patch));
  const stageMoved = patch.stage !== undefined && patch.stage !== cur.stage;
  if (stageMoved) {
    data.stageChangedAt = new Date();
    // Moving into a stage fills in the next step by the workspace's rule, unless the change already says what is next.
    if (patch.nextStep === undefined && patch.nextStepAt === undefined && patch.stage) {
      const plan = await autoPlan(tx, userId, node.workspaceId, patch.stage);
      if (plan) Object.assign(data, plan);
    }
  }
  const nodeData: Prisma.NodeUncheckedUpdateInput = {};
  if (patch.companyId !== undefined) {
    const { parentId, rootId } = await placement(tx, node.workspaceId, patch.companyId);
    data.companyId = parentId;
    nodeData.parentId = parentId;
    nodeData.rootId = rootId;
  }
  if (patch.firstName !== undefined || patch.lastName !== undefined) {
    nodeData.title = fullName(patch.firstName ?? cur.firstName, patch.lastName !== undefined ? patch.lastName : cur.lastName);
  }
  await tx.contact.update({ where: { nodeId: contactId }, data });
  if (stageMoved) await tx.contactStageEvent.create({ data: { contactNodeId: contactId, workspaceId: node.workspaceId, fromStage: cur.stage, toStage: patch.stage as (typeof STAGES)[number], actorId: userId } });
  if (Object.keys(nodeData).length) await tx.node.update({ where: { id: contactId }, data: nodeData });
  await logActivity(tx, { workspaceId: node.workspaceId, nodeId: contactId, actorId: userId, action: "contact.updated", diff: { fields: Object.keys(patch) } });
}

export async function updateContact(userId: string, contactId: string, patch: z.infer<typeof patchContactSchema>) {
  return db.$transaction(async (tx) => {
    await updateContactIn(tx, userId, contactId, patch);
    return getContactIn(tx, userId, contactId);
  });
}

export async function archiveContact(userId: string, contactId: string) {
  await db.$transaction(async (tx) => {
    const node = await loadCrmNode(tx, userId, contactId, "CONTACT", true);
    await tx.deal.updateMany({ where: { primaryContactId: contactId }, data: { primaryContactId: null } });
    await tx.node.update({ where: { id: contactId }, data: { archivedAt: new Date() } });
    await logActivity(tx, { workspaceId: node.workspaceId, nodeId: contactId, actorId: userId, action: "contact.archived" });
  });
}

/** Consent is an auditable event, not just a flag: every change leaves a ConsentRecord. */
export async function setConsent(userId: string, contactId: string, given: boolean, source = "manual") {
  return db.$transaction(async (tx) => {
    const node = await loadCrmNode(tx, userId, contactId, "CONTACT", true);
    const now = new Date();
    if (given) {
      await tx.contact.update({ where: { nodeId: contactId }, data: { consentGiven: true, consentAt: now } });
      await tx.consentRecord.create({ data: { contactNodeId: contactId, purpose: "contact", givenAt: now, source } });
    } else {
      await tx.contact.update({ where: { nodeId: contactId }, data: { consentGiven: false } });
      await tx.consentRecord.updateMany({ where: { contactNodeId: contactId, revokedAt: null }, data: { revokedAt: now } });
    }
    await logActivity(tx, { workspaceId: node.workspaceId, nodeId: contactId, actorId: userId, action: given ? "contact.consent_given" : "contact.consent_revoked" });
    return getContactIn(tx, userId, contactId);
  });
}

// ── reads ──────────────────────────────────────────────────────────────────

export const listContactsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  companyId: z.string().optional(),
  ownerId: z.string().optional(),
  noTouchDays: z.coerce.number().int().min(1).max(3650).optional(),
  stage: z.enum(STAGES).optional(),
  temperature: z.enum(TEMPERATURES).optional(),
  sort: z.enum(["name", "createdAt", "lastContactedAt"]).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export function contactWhere(workspaceId: string, f: Pick<z.infer<typeof listContactsSchema>, "q" | "companyId" | "ownerId" | "noTouchDays"> & { stage?: (typeof STAGES)[number]; temperature?: (typeof TEMPERATURES)[number] }): Prisma.ContactWhereInput {
  const q = f.q;
  return {
    workspaceId,
    node: { archivedAt: null },
    ...(f.companyId ? { companyId: f.companyId } : {}),
    ...(f.ownerId ? { ownerId: f.ownerId } : {}),
    ...(f.stage ? { stage: f.stage } : {}),
    ...(f.temperature ? { temperature: f.temperature } : {}),
    ...(f.noTouchDays ? { OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: new Date(Date.now() - f.noTouchDays * 86_400_000) } }] } : {}),
    ...(q
      ? {
          AND: [
            {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { emails: { has: q.toLowerCase() } },
                { position: { contains: q, mode: "insensitive" } },
                { company: { legalName: { contains: q, mode: "insensitive" } } },
              ],
            },
          ],
        }
      : {}),
  };
}

export async function listContacts(userId: string, workspaceId: string, f: z.infer<typeof listContactsSchema>) {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const where = withScope(contactWhere(workspaceId, f), await contactScope(db, m));
  const { skip, take, page, pageSize } = pageArgs(f);
  const orderBy: Prisma.ContactOrderByWithRelationInput =
    f.sort === "createdAt" ? { node: { createdAt: f.dir } } : f.sort === "lastContactedAt" ? { lastContactedAt: { sort: f.dir, nulls: "last" } } : { firstName: f.dir };
  const [total, rows] = await Promise.all([
    db.contact.count({ where }),
    db.contact.findMany({ where, orderBy, skip, take, include: { company: { select: { legalName: true } }, node: { select: { createdAt: true } } } }),
  ]);
  return {
    total,
    page,
    pageSize,
    items: rows.map((c) => ({
      id: c.nodeId,
      name: fullName(c.firstName, c.lastName),
      firstName: c.firstName,
      lastName: c.lastName,
      position: c.position,
      emails: c.emails,
      phones: c.phones,
      messengers: c.messengers as Record<string, string>,
      companyId: c.companyId,
      companyName: c.company?.legalName ?? null,
      ownerId: c.ownerId,
      lastContactedAt: c.lastContactedAt,
      consentGiven: c.consentGiven,
      createdAt: c.node.createdAt,
      stage: c.stage,
      temperature: c.temperature,
      nextStep: c.nextStep,
      nextStepAt: c.nextStepAt,
    })),
  };
}

export async function getContact(userId: string, contactId: string) {
  return db.$transaction((tx) => getContactIn(tx, userId, contactId));
}

export async function getContactIn(tx: Tx, userId: string, contactId: string) {
  const node = await loadCrmNode(tx, userId, contactId, "CONTACT");
  const c = await tx.contact.findUniqueOrThrow({ where: { nodeId: contactId }, include: { company: { select: { legalName: true } } } });
  const [deals, consent, tags] = await Promise.all([
    tx.deal.findMany({ where: { primaryContactId: contactId, node: { archivedAt: null } }, include: { node: { select: { title: true } }, stage: true } }),
    tx.consentRecord.findMany({ where: { contactNodeId: contactId }, orderBy: { givenAt: "desc" } }),
    tx.nodeTag.findMany({ where: { nodeId: contactId }, select: { tag: { select: { id: true, name: true, color: true } } } }),
  ]);
  return {
    id: node.id,
    name: node.title,
    firstName: c.firstName,
    lastName: c.lastName,
    position: c.position,
    emails: c.emails,
    phones: c.phones,
    messengers: c.messengers as Record<string, string>,
    companyId: c.companyId,
    companyName: c.company?.legalName ?? null,
    ownerId: c.ownerId,
    birthday: c.birthday,
    consentGiven: c.consentGiven,
    consentAt: c.consentAt,
    lastContactedAt: c.lastContactedAt,
    createdAt: node.createdAt,
    stage: c.stage,
    stageChangedAt: c.stageChangedAt,
    temperature: c.temperature,
    interests: c.interests,
    source: c.source,
    influence: c.influence,
    nextStep: c.nextStep,
    nextStepAt: c.nextStepAt,
    typeTag: c.typeTag,
    country: c.country,
    sponsorName: c.sponsorName,
    groupId: c.groupId,
    sponsorId: c.sponsorId,
    heldById: c.heldById,
    linkedUserId: c.linkedUserId,
    transfers: await listTransfers(tx, contactId),
    tags: tags.map((t) => t.tag),
    consentHistory: consent,
    deals: deals.map((d) => ({ id: d.nodeId, title: d.node.title, stage: d.stage.name, amount: Number(d.amount), currency: d.currency })),
  };
}

export async function contactDuplicateGroups(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:full");
  const all = await db.contact.findMany({ where: { workspaceId, node: { archivedAt: null } }, select: { nodeId: true, firstName: true, lastName: true, emails: true, phones: true } });
  return findDuplicateGroups(all.map((c) => ({ id: c.nodeId, ...c })), contactKeys).map((g) => g.map((c) => ({ id: c.id, name: fullName(c.firstName, c.lastName), emails: c.emails, phones: c.phones })));
}

// ── GDPR ───────────────────────────────────────────────────────────────────

/** Everything we hold about one person, as portable JSON. */
export async function gdprExport(userId: string, contactId: string) {
  return db.$transaction(async (tx) => {
    const node = await loadCrmNode(tx, userId, contactId, "CONTACT");
    await loadWorkspaceMember(tx, userId, node.workspaceId, "crm:export");
    const [contact, consent, activities, comments, ingests, deals, stageHistory] = await Promise.all([
      tx.contact.findUniqueOrThrow({ where: { nodeId: contactId } }),
      tx.consentRecord.findMany({ where: { contactNodeId: contactId } }),
      tx.crmActivity.findMany({ where: { contactId } }),
      tx.comment.findMany({ where: { nodeId: contactId }, select: { body: true, createdAt: true } }),
      tx.leadIngest.findMany({ where: { contactId }, select: { source: true, payload: true, createdAt: true } }),
      tx.deal.findMany({ where: { primaryContactId: contactId }, select: { nodeId: true, amount: true, currency: true } }),
      tx.contactStageEvent.findMany({ where: { contactNodeId: contactId }, select: { fromStage: true, toStage: true, at: true }, orderBy: { at: "asc" } }),
    ]);
    await logActivity(tx, { workspaceId: node.workspaceId, nodeId: null, actorId: userId, action: "contact.gdpr_exported", diff: { contactId } });
    return { exportedAt: new Date().toISOString(), contact: { ...contact, name: node.title, createdAt: node.createdAt }, consent, activities, comments, leadSubmissions: ingests, deals, stageHistory };
  });
}

export const erasureSchema = z.object({ confirm: z.literal("ERASE") });

/**
 * Permanently removes a person and everything attached to them. Irreversible, so it needs an explicit
 * confirmation, the `crm:erase` permission (owner/admin) and leaves a PII-free audit entry.
 */
export async function gdprErase(userId: string, contactId: string): Promise<void> {
  const files: string[] = [];
  const workspaceId = await db.$transaction(async (tx) => {
    const node = await loadCrmNode(tx, userId, contactId, "CONTACT", true);
    await loadWorkspaceMember(tx, userId, node.workspaceId, "crm:erase");
    const attachments = await tx.attachment.findMany({ where: { nodeId: contactId }, select: { url: true } });
    files.push(...attachments.map((a) => a.url));
    await tx.crmActivity.deleteMany({ where: { contactId } });
    await tx.consentRecord.deleteMany({ where: { contactNodeId: contactId } });
    await tx.leadIngest.deleteMany({ where: { contactId } });
    await tx.activityLog.deleteMany({ where: { nodeId: contactId } });
    await tx.reminder.deleteMany({ where: { targetNodeId: contactId } });
    await tx.node.delete({ where: { id: contactId } }); // cascades contact row, comments, attachments rows, tags, links
    await logActivity(tx, { workspaceId: node.workspaceId, nodeId: null, actorId: userId, action: "contact.gdpr_erased", diff: { contactId } });
    return node.workspaceId;
  });
  void workspaceId;
  for (const key of files) await deleteObject(key).catch(() => undefined);
}
