import { announceToSlack } from "@/server/integrations/slack";
import { emit as emitWebhook } from "@/server/webhooks";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { ApiError, notFound } from "@/server/http/errors";
import { LeadRejected, leadNote, parseLead, type LeadInput } from "@/modules/crm/lead-intake";
import { answerSoon } from "@/modules/crm/lead-queue";
import { normalizeDomain } from "@/modules/crm/normalize";
import { loadWorkspaceMember, type Tx } from "@/server/services/nodes/access";
import { notify } from "../notify";
import { createActivityIn } from "./activities";
import { createCompanyIn } from "./companies";
import { assertContactCapacity, createContactIn, findContactMatches } from "./contacts";
import { fullName } from "./common";
import { createDealIn } from "./deals";

// ── forms ──────────────────────────────────────────────────────────────────

/** A browser sends `Origin: https://site.com` with no path and no slash; a pasted address usually has one. */
export const normalizeOrigin = (u: string): string => {
  try {
    return new URL(u).origin;
  } catch {
    return u;
  }
};

export const FORM_FIELDS = ["name", "email", "phone", "telegram", "company", "message", "amount"] as const;

export const leadFormConfigSchema = z.object({
  title: z.string().trim().max(120).default("Contact us"),
  submitLabel: z.string().trim().max(40).default("Send"),
  successMessage: z.string().trim().max(300).default("Thank you! We will get back to you shortly."),
  consentText: z.string().trim().max(400).nullable().default(null),
  redirectUrl: z.string().url().nullable().default(null),
  fields: z
    .array(z.object({ key: z.enum(FORM_FIELDS), label: z.string().trim().max(60), required: z.boolean().default(false) }))
    .min(1)
    .max(FORM_FIELDS.length)
    .default([
      { key: "name", label: "Name", required: true },
      { key: "email", label: "Email", required: true },
      { key: "message", label: "Message", required: false },
    ]),
  /** Origins allowed to embed the form and post to it; empty = anywhere (no cookies are involved). */
  allowedOrigins: z.array(z.string().url().transform(normalizeOrigin)).max(20).default([]),
  ownerId: z.string().nullable().default(null),
  stageId: z.string().nullable().default(null),
});
export type LeadFormConfig = z.infer<typeof leadFormConfigSchema>;

export const leadFormSchema = z.object({ name: z.string().trim().min(1).max(80), pipelineId: z.string(), enabled: z.boolean().default(true), config: leadFormConfigSchema.default({}) });
export const patchLeadFormSchema = leadFormSchema.partial();

const newKey = () => randomBytes(18).toString("base64url");

async function loadForm(tx: Tx, userId: string, id: string) {
  const f = await tx.leadForm.findUnique({ where: { id } });
  if (!f) throw notFound("form");
  await loadWorkspaceMember(tx, userId, f.workspaceId, "leadform:manage");
  return f;
}

async function checkFormTargets(tx: Tx, workspaceId: string, pipelineId: string, config: LeadFormConfig) {
  const p = await tx.pipeline.findFirst({ where: { id: pipelineId, workspaceId }, include: { stages: true } });
  if (!p) throw notFound("pipeline");
  if (config.stageId) {
    const s = p.stages.find((x) => x.id === config.stageId);
    if (!s || s.isWon || s.isLost) throw new ApiError(422, "invalid_stage", "Choose an open stage of this pipeline");
  }
}

export async function listLeadForms(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "leadform:manage");
  return db.leadForm.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
}

export async function createLeadForm(userId: string, workspaceId: string, input: z.infer<typeof leadFormSchema>) {
  return db.$transaction(async (tx) => {
    await loadWorkspaceMember(tx, userId, workspaceId, "leadform:manage");
    await checkFormTargets(tx, workspaceId, input.pipelineId, input.config);
    return tx.leadForm.create({ data: { workspaceId, name: input.name, pipelineId: input.pipelineId, enabled: input.enabled, publicKey: newKey(), config: input.config as Prisma.InputJsonValue } });
  });
}

export async function updateLeadForm(userId: string, id: string, patch: z.infer<typeof patchLeadFormSchema>) {
  return db.$transaction(async (tx) => {
    const f = await loadForm(tx, userId, id);
    const config = patch.config ?? leadFormConfigSchema.parse(f.config);
    await checkFormTargets(tx, f.workspaceId, patch.pipelineId ?? f.pipelineId, config);
    return tx.leadForm.update({ where: { id }, data: { name: patch.name, pipelineId: patch.pipelineId, enabled: patch.enabled, config: config as Prisma.InputJsonValue } });
  });
}

export async function deleteLeadForm(userId: string, id: string) {
  await db.$transaction(async (tx) => {
    await loadForm(tx, userId, id);
    await tx.leadForm.delete({ where: { id } });
  });
}

/** What the public page needs; nothing about the workspace beyond the form itself. */
export async function getPublicForm(publicKey: string) {
  const f = await db.leadForm.findUnique({ where: { publicKey } });
  if (!f || !f.enabled) throw notFound("form");
  return { id: f.id, name: f.name, config: leadFormConfigSchema.parse(f.config), workspaceId: f.workspaceId };
}

export function embedSnippets(appUrl: string, publicKey: string) {
  const src = `${appUrl}/f/${publicKey}`;
  return {
    url: src,
    iframe: `<iframe src="${src}" style="width:100%;border:0;min-height:420px" loading="lazy" title="Contact form"></iframe>\n<script>window.addEventListener("message",function(e){if(e.data&&e.data.meetowlHeight){var f=document.querySelector('iframe[src="${src}"]');if(f)f.style.height=e.data.meetowlHeight+"px"}})</script>`,
    html: `<form action="${appUrl}/api/public/leads/${publicKey}" method="post">\n  <input name="name" placeholder="Name" required>\n  <input name="email" type="email" placeholder="Email" required>\n  <textarea name="message" placeholder="Message"></textarea>\n  <input name="hp" style="display:none" tabindex="-1" autocomplete="off">\n  <button type="submit">Send</button>\n</form>`,
  };
}

// ── webhook ────────────────────────────────────────────────────────────────

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export const webhookConfigSchema = z.object({ tokenHash: z.string(), pipelineId: z.string().nullable().default(null), stageId: z.string().nullable().default(null), ownerId: z.string().nullable().default(null) });

/** Issues a new inbound token (the old one stops working). The raw token is returned once and never stored. */
export async function rotateWebhookToken(userId: string, workspaceId: string, opts: { pipelineId?: string | null; stageId?: string | null; ownerId?: string | null } = {}) {
  await loadWorkspaceMember(db, userId, workspaceId, "leadform:manage");
  const token = `mol_${randomBytes(24).toString("base64url")}`;
  const cur = await db.integration.findUnique({ where: { workspaceId_kind: { workspaceId, kind: "WEBHOOK" } } });
  const old = cur ? webhookConfigSchema.safeParse(cur.config) : null;
  const config = { tokenHash: sha(token), pipelineId: opts.pipelineId ?? (old?.success ? old.data.pipelineId : null), stageId: opts.stageId ?? (old?.success ? old.data.stageId : null), ownerId: opts.ownerId ?? (old?.success ? old.data.ownerId : null) };
  await db.integration.upsert({
    where: { workspaceId_kind: { workspaceId, kind: "WEBHOOK" } },
    create: { workspaceId, kind: "WEBHOOK", config },
    update: { config },
  });
  return { token };
}

export async function getWebhookInfo(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "leadform:manage");
  const cur = await db.integration.findUnique({ where: { workspaceId_kind: { workspaceId, kind: "WEBHOOK" } } });
  const cfg = cur ? webhookConfigSchema.safeParse(cur.config) : null;
  return { configured: !!cfg?.success, pipelineId: cfg?.success ? cfg.data.pipelineId : null, stageId: cfg?.success ? cfg.data.stageId : null, ownerId: cfg?.success ? cfg.data.ownerId : null };
}

export async function resolveWebhook(token: string) {
  const hash = sha(token);
  const row = await db.integration.findFirst({ where: { kind: "WEBHOOK", config: { path: ["tokenHash"], equals: hash } } });
  if (!row) return null;
  const cfg = webhookConfigSchema.parse(row.config);
  const a = Buffer.from(cfg.tokenHash);
  const b = Buffer.from(hash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { workspaceId: row.workspaceId, ...cfg };
}

export async function listIngests(userId: string, workspaceId: string, take = 50) {
  await loadWorkspaceMember(db, userId, workspaceId, "leadform:manage");
  return db.leadIngest.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: Math.min(take, 200), select: { id: true, source: true, status: true, error: true, contactId: true, dealId: true, createdAt: true } });
}

// ── intake ─────────────────────────────────────────────────────────────────

export interface IngestOptions {
  workspaceId: string;
  /** "form:<id>" or "webhook" */
  source: string;
  sourceLabel: string;
  pipelineId?: string | null;
  stageId?: string | null;
  ownerId?: string | null;
  idempotencyKey?: string | null;
  ipHash?: string | null;
}

export interface IngestResult {
  status: "created" | "duplicate" | "rejected";
  contactId: string | null;
  dealId: string | null;
  companyId: string | null;
}

const REUSE_WINDOW_MS = 14 * 86_400_000;

async function pickActor(tx: Tx, workspaceId: string, ownerId?: string | null): Promise<string> {
  if (ownerId) {
    const m = await tx.membership.findUnique({ where: { userId_workspaceId: { userId: ownerId, workspaceId } } });
    if (m && m.role !== "CLIENT") return ownerId;
  }
  const owner = await tx.membership.findFirst({ where: { workspaceId, role: "OWNER" }, orderBy: { createdAt: "asc" } });
  if (!owner) throw new ApiError(500, "no_owner", "Workspace has no owner");
  return owner.userId;
}

/** The member whose referral code the lead carries (a link or a QR of theirs), when they still belong to the workspace and are not a client. */
async function ownerOfRef(tx: Tx, workspaceId: string, code: string): Promise<string | null> {
  const link = await tx.referralLink.findFirst({ where: { code, workspaceId }, select: { userId: true } });
  if (!link) return null;
  const m = await tx.membership.findUnique({ where: { userId_workspaceId: { userId: link.userId, workspaceId } } });
  return m && m.role !== "CLIENT" ? link.userId : null;
}

/** Puts the person at the head of today's touches with a reminder to answer within the hour, unless a nearer step is already planned. */
async function markForReply(tx: Tx, contactId: string, actor: string, now: Date) {
  const c = await tx.contact.findUniqueOrThrow({ where: { nodeId: contactId }, select: { nextStepAt: true } });
  if (c.nextStepAt && c.nextStepAt <= now) return;
  const u = await tx.user.findUnique({ where: { id: actor }, select: { locale: true } });
  await tx.contact.update({ where: { nodeId: contactId }, data: { nextStep: answerSoon(u?.locale), nextStepAt: now } });
}

async function findCompany(tx: Tx, workspaceId: string, lead: LeadInput): Promise<string | null> {
  const domain = normalizeDomain(lead.website);
  const row = await tx.company.findFirst({
    where: { workspaceId, node: { archivedAt: null }, OR: [...(domain ? [{ domain }] : []), ...(lead.company ? [{ legalName: { equals: lead.company, mode: "insensitive" as const } }] : [])] },
    select: { nodeId: true },
  });
  return row?.nodeId ?? null;
}

/**
 * Turns an inbound lead into CRM records: finds or creates the contact (by e-mail / phone) and the
 * company, opens a deal in the first open stage unless the same person already has a fresh open deal in
 * that pipeline, logs the message, records consent and notifies the owner. Idempotent per key.
 */
export async function ingestLead(opts: IngestOptions, raw: unknown): Promise<IngestResult> {
  const key = opts.idempotencyKey?.slice(0, 120) || null;
  if (key) {
    const prior = await db.leadIngest.findUnique({ where: { workspaceId_idempotencyKey: { workspaceId: opts.workspaceId, idempotencyKey: key } } });
    if (prior) return { status: "duplicate", contactId: prior.contactId, dealId: prior.dealId, companyId: null };
  }

  const record = (status: string, extra: Partial<{ contactId: string; dealId: string; error: string }> = {}, payload: unknown = raw) =>
    db.leadIngest.create({
      data: { workspaceId: opts.workspaceId, source: opts.source, idempotencyKey: key, ipHash: opts.ipHash ?? null, status, payload: (typeof payload === "object" && payload !== null ? payload : { value: String(payload) }) as Prisma.InputJsonValue, ...extra },
    });

  let lead: LeadInput;
  try {
    lead = parseLead(raw);
  } catch (e) {
    if (e instanceof LeadRejected) {
      await record("rejected", { error: e.code }, e.code === "too_large" ? { note: "payload dropped: too large" } : raw);
      if (e.code === "honeypot") return { status: "rejected", contactId: null, dealId: null, companyId: null };
      throw new ApiError(422, e.code, e.message);
    }
    throw e;
  }

  try {
    const out = await db.$transaction(async (tx) => {
      // A lead that came through somebody's own link belongs to them and is a person to talk to, not a deal; without a label it goes to the leader.
      const refOwner = lead.ref ? await ownerOfRef(tx, opts.workspaceId, lead.ref) : null;
      const actor = refOwner ?? (await pickActor(tx, opts.workspaceId, opts.ownerId));
      const now = new Date();

      let contactId = (await findContactMatches(tx, opts.workspaceId, lead.email ? [lead.email] : [], lead.phone ? [lead.phone] : [], undefined, lead.telegram))[0]?.id ?? null;
      const existed = !!contactId;
      let companyId = refOwner ? null : await findCompany(tx, opts.workspaceId, lead);
      if (!companyId && lead.company && !refOwner) {
        companyId = (await createCompanyIn(tx, actor, opts.workspaceId, { legalName: lead.company, website: lead.website, source: opts.sourceLabel, lifecycleStage: "LEAD" })).id;
      }
      if (!contactId) {
        await assertContactCapacity(tx, opts.workspaceId, 1);
        contactId = (
          await createContactIn(tx, actor, opts.workspaceId, {
            firstName: lead.firstName,
            lastName: lead.lastName,
            emails: lead.email ? [lead.email] : [],
            phones: lead.phone ? [lead.phone] : [],
            messengers: lead.telegram ? { telegram: `@${lead.telegram}` } : {},
            companyId,
            source: opts.sourceLabel,
            ownerId: actor,
            consentGiven: lead.consent,
            consentSource: opts.source,
          })
        ).id;
      } else {
        const c = await tx.contact.findUniqueOrThrow({ where: { nodeId: contactId } });
        if (lead.consent && !c.consentGiven) {
          await tx.contact.update({ where: { nodeId: contactId }, data: { consentGiven: true, consentAt: now } });
          await tx.consentRecord.create({ data: { contactNodeId: contactId, purpose: "contact", givenAt: now, source: opts.source } });
        }
        if (!c.companyId && companyId) {
          await tx.contact.update({ where: { nodeId: contactId }, data: { companyId } });
          await tx.node.update({ where: { id: contactId }, data: { parentId: companyId, rootId: companyId } });
        }
        companyId ??= c.companyId;
      }

      await markForReply(tx, contactId, actor, now);

      if (refOwner) {
        await createActivityIn(tx, actor, opts.workspaceId, { type: "MESSAGE", subject: `Inquiry via ${opts.sourceLabel}`, body: leadNote(lead) || null, contactId, companyId: null, dealId: null, completed: true, ownerId: actor });
        const who = fullName(lead.firstName, lead.lastName);
        const personal: IngestResult["status"] = existed ? "duplicate" : "created";
        await notify({ userId: actor, workspaceId: opts.workspaceId, kind: "lead", title: personal === "created" ? `New lead: ${who}` : `Repeat inquiry from ${who}`, body: opts.sourceLabel, url: "/crm/touches", payload: { contactId, source: opts.sourceLabel, status: personal } }, tx);
        await tx.leadIngest.create({ data: { workspaceId: opts.workspaceId, source: opts.source, idempotencyKey: key, ipHash: opts.ipHash ?? null, status: personal, contactId, dealId: null, payload: raw as Prisma.InputJsonValue } });
        return { status: personal, contactId, dealId: null, companyId: null };
      }

      const pipeline = opts.pipelineId ? await tx.pipeline.findFirst({ where: { id: opts.pipelineId, workspaceId: opts.workspaceId } }) : null;
      const pipelineId = pipeline?.id ?? (await tx.pipeline.findFirst({ where: { workspaceId: opts.workspaceId, isDefault: true } }))?.id;

      const existing = await tx.deal.findFirst({
        where: { primaryContactId: contactId, ...(pipelineId ? { pipelineId } : {}), stage: { isWon: false, isLost: false }, node: { archivedAt: null, createdAt: { gt: new Date(now.getTime() - REUSE_WINDOW_MS) } } },
        orderBy: { node: { createdAt: "desc" } },
      });
      let dealId = existing?.nodeId ?? null;
      const status: IngestResult["status"] = existing ? "duplicate" : "created";
      if (!dealId) {
        dealId = (
          await createDealIn(tx, actor, opts.workspaceId, {
            title: lead.company ? `${lead.company} — ${fullName(lead.firstName, lead.lastName)}` : fullName(lead.firstName, lead.lastName),
            amount: lead.amount ?? 0,
            currency: "EUR",
            pipelineId: pipelineId ?? undefined,
            stageId: opts.stageId ?? undefined,
            companyId,
            primaryContactId: contactId,
            ownerId: actor,
            source: opts.sourceLabel,
            nextStep: "Reply to the inquiry",
            nextStepAt: new Date(now.getTime() + 86_400_000).toISOString(),
          })
        ).id;
      }

      await createActivityIn(tx, actor, opts.workspaceId, {
        type: "MESSAGE",
        subject: `Inquiry via ${opts.sourceLabel}`,
        body: leadNote(lead) || null,
        contactId,
        companyId,
        dealId,
        completed: true,
        ownerId: actor,
      });
      await notify({ userId: actor, workspaceId: opts.workspaceId, kind: "lead", title: status === "created" ? `New lead: ${fullName(lead.firstName, lead.lastName)}` : `Repeat inquiry from ${fullName(lead.firstName, lead.lastName)}`, body: `${opts.sourceLabel}${lead.company ? ` · ${lead.company}` : ""}`, url: `/crm?deal=${dealId}`, payload: { dealId, contactId, source: opts.sourceLabel, status } }, tx);
      await tx.leadIngest.create({
        data: { workspaceId: opts.workspaceId, source: opts.source, idempotencyKey: key, ipHash: opts.ipHash ?? null, status, contactId, dealId, payload: raw as Prisma.InputJsonValue },
      });
      return { status, contactId, dealId, companyId };
    });
    if (out.status === "created") await emitWebhook(opts.workspaceId, "lead.created", { dealId: out.dealId, contactId: out.contactId, source: opts.sourceLabel });
    if (out.status === "created") await announceToSlack(opts.workspaceId, "lead", { title: `New lead: ${fullName(lead.firstName, lead.lastName)}`, body: `${opts.sourceLabel}${lead.company ? ` · ${lead.company}` : ""}`, url: `/crm?deal=${out.dealId}` });
    return out;
  } catch (e) {
    if (e instanceof ApiError) await record("rejected", { error: e.code }).catch(() => undefined);
    throw e;
  }
}
