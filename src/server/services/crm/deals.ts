import { z } from "zod";
import type { Health, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { notFound } from "@/server/http/errors";
import {
  applyStageMove,
  columnTotals,
  dealHealth,
  DealRuleError,
  effectiveProbability,
  lifecycleAfterDeal,
  stageStatus,
  type ColumnTotals,
  type DealStatus,
} from "@/modules/crm/deal-rules";
import { between, evenPositions, needsRebalance } from "@/modules/nodes/position";
import { loadWorkspaceMember, logActivity, type Tx } from "@/server/services/nodes/access";
import { notify } from "../notify";
import { publishBoard } from "@/server/realtime";
import { announceToSlack } from "@/server/integrations/slack";
import { emit as emitWebhook } from "@/server/webhooks";
import { createProjectIn, transact } from "@/server/services/nodes/ops";
import { assertWorkspaceMember, fullName, invalid, loadCrmNode, pageArgs, STALE_DAYS, STUCK_DAYS, toDate, toNum } from "./common";

const text = (max: number) => z.string().trim().max(max).nullable().optional();

export const dealFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  amount: z.number().min(0).max(1e12).default(0),
  currency: z.string().trim().length(3).toUpperCase().default("EUR"),
  expectedCloseDate: z.string().datetime().nullable().optional(),
  probability: z.number().int().min(0).max(100).nullable().optional(),
  ownerId: z.string().nullable().optional(),
  companyId: z.string().nullable().optional(),
  primaryContactId: z.string().nullable().optional(),
  source: text(80),
  nextStep: text(300),
  nextStepAt: z.string().datetime().nullable().optional(),
});
export const createDealSchema = dealFieldsSchema.extend({ pipelineId: z.string().optional(), stageId: z.string().optional() });
export const patchDealSchema = dealFieldsSchema.partial().refine((v) => Object.keys(v).length > 0, "Nothing to update");
export const moveDealSchema = z.object({ stageId: z.string(), lostReasonId: z.string().nullable().optional(), afterId: z.string().nullable().optional(), beforeId: z.string().nullable().optional() });
export const loseDealSchema = z.object({ lostReasonId: z.string() });
export const createProjectFromDealSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  template: z.enum(["empty", "agile-sprint-map", "product-roadmap", "agency-client-project"]).optional(),
  templateId: z.string().optional(),
});

const asApi = (e: unknown): never => {
  if (e instanceof DealRuleError) throw invalid(e.code, e.message);
  throw e;
};

export interface DealCard {
  id: string;
  title: string;
  amount: number;
  currency: string;
  probability: number;
  stageId: string;
  status: DealStatus;
  ownerId: string | null;
  companyId: string | null;
  companyName: string | null;
  contactId: string | null;
  contactName: string | null;
  nextStep: string | null;
  nextStepAt: Date | null;
  expectedCloseDate: Date | null;
  lastActivityAt: Date | null;
  wonAt: Date | null;
  lostAt: Date | null;
  health: Health;
  daysInStage: number;
  position: number;
  createdAt: Date;
}

type DealRow = Prisma.DealGetPayload<{
  include: { node: { select: { title: true; position: true; createdAt: true } }; stage: true; company: { select: { legalName: true } }; primaryContact: { select: { firstName: true; lastName: true } } };
}>;

const cardInclude = {
  node: { select: { title: true, position: true, createdAt: true } },
  stage: true,
  company: { select: { legalName: true } },
  primaryContact: { select: { firstName: true, lastName: true } },
} as const;

export function toCard(d: DealRow, now: Date): DealCard {
  const status = stageStatus(d.stage);
  return {
    id: d.nodeId,
    title: d.node.title,
    amount: toNum(d.amount),
    currency: d.currency,
    probability: effectiveProbability(d.stage, d.probability),
    stageId: d.stageId,
    status,
    ownerId: d.ownerId,
    companyId: d.companyId,
    companyName: d.company?.legalName ?? null,
    contactId: d.primaryContactId,
    contactName: d.primaryContact ? fullName(d.primaryContact.firstName, d.primaryContact.lastName) : null,
    nextStep: d.nextStep,
    nextStepAt: d.nextStepAt,
    expectedCloseDate: d.expectedCloseDate,
    lastActivityAt: d.lastActivityAt,
    wonAt: d.wonAt,
    lostAt: d.lostAt,
    health: dealHealth({ status, lastActivityAt: d.lastActivityAt, stageEnteredAt: d.stageEnteredAt, nextStep: d.nextStep, nextStepAt: d.nextStepAt, expectedCloseDate: d.expectedCloseDate }, now, { staleDays: STALE_DAYS, stuckDays: STUCK_DAYS }),
    daysInStage: Math.max(0, Math.floor((now.getTime() - d.stageEnteredAt.getTime()) / 86_400_000)),
    position: d.node.position,
    createdAt: d.node.createdAt,
  };
}

// ── helpers ────────────────────────────────────────────────────────────────

async function loadStage(tx: Tx, workspaceId: string, stageId: string) {
  const stage = await tx.pipelineStage.findUnique({ where: { id: stageId }, include: { pipeline: { select: { workspaceId: true } } } });
  if (!stage || stage.pipeline.workspaceId !== workspaceId) throw notFound("stage");
  return stage;
}

async function checkLinks(tx: Tx, workspaceId: string, companyId?: string | null, contactId?: string | null) {
  if (companyId) {
    const c = await tx.node.findUnique({ where: { id: companyId }, select: { type: true, workspaceId: true, archivedAt: true } });
    if (!c || c.type !== "COMPANY" || c.workspaceId !== workspaceId || c.archivedAt) throw invalid("invalid_company", "Company not found in this workspace");
  }
  if (contactId) {
    const c = await tx.node.findUnique({ where: { id: contactId }, select: { type: true, workspaceId: true, archivedAt: true } });
    if (!c || c.type !== "CONTACT" || c.workspaceId !== workspaceId || c.archivedAt) throw invalid("invalid_contact", "Contact not found in this workspace");
  }
}

/** Position for a card dropped between neighbours in one column; renumbers the column when floats run out. */
async function placeInStage(tx: Tx, stageId: string, where: { afterId?: string | null; beforeId?: string | null }, excludeId?: string): Promise<number> {
  const sibs = await tx.deal.findMany({
    where: { stageId, node: { archivedAt: null }, ...(excludeId ? { nodeId: { not: excludeId } } : {}) },
    orderBy: { node: { position: "asc" } },
    select: { nodeId: true, node: { select: { position: true } } },
  });
  let idx = sibs.length;
  if (where.afterId) {
    const i = sibs.findIndex((s) => s.nodeId === where.afterId);
    if (i >= 0) idx = i + 1;
  } else if (where.beforeId) {
    const i = sibs.findIndex((s) => s.nodeId === where.beforeId);
    if (i >= 0) idx = i;
  }
  const prev = sibs[idx - 1]?.node.position ?? null;
  const next = sibs[idx]?.node.position ?? null;
  if (!needsRebalance(prev, next)) return between(prev, next);
  const even = evenPositions(sibs.length + 1);
  let j = 0;
  for (let k = 0; k < sibs.length + 1; k++) {
    if (k === idx) continue;
    const sib = sibs[j++];
    if (sib) await tx.node.update({ where: { id: sib.nodeId }, data: { position: even[k] } });
  }
  return even[idx] ?? between(prev, next);
}

// ── create / update ────────────────────────────────────────────────────────

export interface NewDeal extends z.infer<typeof createDealSchema> {
  /** Used by lead intake: skip the owner membership check path that needs a signed-in actor. */
  lastActivityAt?: Date;
}

export async function createDealIn(tx: Tx, userId: string, workspaceId: string, input: NewDeal): Promise<{ id: string }> {
  await assertWorkspaceMember(tx, workspaceId, input.ownerId);
  await checkLinks(tx, workspaceId, input.companyId, input.primaryContactId);

  let stageId = input.stageId;
  let pipelineId = input.pipelineId;
  if (!stageId) {
    const pipeline = pipelineId
      ? await tx.pipeline.findFirst({ where: { id: pipelineId, workspaceId }, include: { stages: { orderBy: { order: "asc" } } } })
      : ((await tx.pipeline.findFirst({ where: { workspaceId, isDefault: true }, include: { stages: { orderBy: { order: "asc" } } } })) ??
        (await tx.pipeline.findFirst({ where: { workspaceId }, include: { stages: { orderBy: { order: "asc" } } } })));
    if (!pipeline) throw notFound("pipeline");
    const first = pipeline.stages.find((s) => !s.isWon && !s.isLost);
    if (!first) throw invalid("no_open_stage", "The pipeline has no open stage");
    stageId = first.id;
    pipelineId = pipeline.id;
  }
  const stage = await loadStage(tx, workspaceId, stageId);
  if (stage.isWon || stage.isLost) throw invalid("closed_stage", "Create the deal in an open stage, then close it");
  pipelineId = stage.pipelineId;

  const last = await tx.deal.findFirst({ where: { stageId }, orderBy: { node: { position: "desc" } }, select: { node: { select: { position: true } } } });
  const now = new Date();
  const node = await tx.node.create({
    data: {
      workspaceId,
      type: "DEAL",
      title: input.title,
      parentId: input.companyId ?? null,
      rootId: input.companyId ?? null,
      createdById: userId,
      position: between(last?.node.position ?? null, null),
      data: {},
    },
  });
  await tx.deal.create({
    data: {
      nodeId: node.id,
      workspaceId,
      pipelineId,
      stageId,
      amount: input.amount,
      currency: input.currency,
      expectedCloseDate: toDate(input.expectedCloseDate),
      probability: input.probability ?? null,
      ownerId: input.ownerId ?? userId,
      companyId: input.companyId ?? null,
      primaryContactId: input.primaryContactId ?? null,
      source: input.source?.trim() || null,
      nextStep: input.nextStep?.trim() || null,
      nextStepAt: toDate(input.nextStepAt),
      stageEnteredAt: now,
      lastActivityAt: input.lastActivityAt ?? now,
    },
  });
  await tx.dealStageEvent.create({ data: { dealId: node.id, workspaceId, pipelineId, fromStageId: null, toStageId: stageId, actorId: userId, at: now } });
  if (input.companyId) {
    const co = await tx.company.findUniqueOrThrow({ where: { nodeId: input.companyId } });
    const next = lifecycleAfterDeal(co.lifecycleStage, "created");
    if (next !== co.lifecycleStage) await tx.company.update({ where: { nodeId: co.nodeId }, data: { lifecycleStage: next } });
  }
  await logActivity(tx, { workspaceId, nodeId: node.id, actorId: userId, action: "deal.created", diff: { title: input.title, amount: input.amount } });
  return { id: node.id };
}

export async function createDeal(userId: string, workspaceId: string, input: z.infer<typeof createDealSchema>) {
  return db.$transaction(async (tx) => {
    await loadWorkspaceMember(tx, userId, workspaceId, "crm:full");
    const { id } = await createDealIn(tx, userId, workspaceId, input);
    publishBoard(workspaceId, userId);
    return getDealIn(tx, userId, id);
  });
}

export async function updateDeal(userId: string, dealId: string, patch: z.infer<typeof patchDealSchema>) {
  return db.$transaction(async (tx) => {
    const node = await loadCrmNode(tx, userId, dealId, "DEAL", true);
    await assertWorkspaceMember(tx, node.workspaceId, patch.ownerId);
    await checkLinks(tx, node.workspaceId, patch.companyId, patch.primaryContactId);
    const data: Prisma.DealUncheckedUpdateInput = {};
    if (patch.amount !== undefined) data.amount = patch.amount;
    if (patch.currency !== undefined) data.currency = patch.currency;
    if (patch.expectedCloseDate !== undefined) data.expectedCloseDate = toDate(patch.expectedCloseDate);
    if (patch.probability !== undefined) data.probability = patch.probability;
    if (patch.ownerId !== undefined) data.ownerId = patch.ownerId;
    if (patch.primaryContactId !== undefined) data.primaryContactId = patch.primaryContactId;
    if (patch.source !== undefined) data.source = patch.source?.trim() || null;
    if (patch.nextStep !== undefined) data.nextStep = patch.nextStep?.trim() || null;
    if (patch.nextStepAt !== undefined) data.nextStepAt = toDate(patch.nextStepAt);
    const nodeData: Prisma.NodeUncheckedUpdateInput = {};
    if (patch.title !== undefined) nodeData.title = patch.title;
    if (patch.companyId !== undefined) {
      data.companyId = patch.companyId;
      nodeData.parentId = patch.companyId;
      nodeData.rootId = patch.companyId;
    }
    if (Object.keys(data).length) await tx.deal.update({ where: { nodeId: dealId }, data });
    if (Object.keys(nodeData).length) await tx.node.update({ where: { id: dealId }, data: nodeData });
    await logActivity(tx, { workspaceId: node.workspaceId, nodeId: dealId, actorId: userId, action: "deal.updated", diff: { fields: Object.keys(patch) } });
    publishBoard(node.workspaceId, userId);
    return getDealIn(tx, userId, dealId);
  });
}

export async function archiveDeal(userId: string, dealId: string) {
  await db.$transaction(async (tx) => {
    const node = await loadCrmNode(tx, userId, dealId, "DEAL", true);
    await tx.node.update({ where: { id: dealId }, data: { archivedAt: new Date() } });
    await logActivity(tx, { workspaceId: node.workspaceId, nodeId: dealId, actorId: userId, action: "deal.archived" });
    publishBoard(node.workspaceId, userId);
  });
}

// ── stage moves ────────────────────────────────────────────────────────────

export async function moveDeal(userId: string, dealId: string, input: z.infer<typeof moveDealSchema>) {
  let won: { workspaceId: string; title: string; amount: string } | null = null;
  const out = await db.$transaction(async (tx) => {
    const node = await loadCrmNode(tx, userId, dealId, "DEAL", true);
    const deal = await tx.deal.findUniqueOrThrow({ where: { nodeId: dealId }, include: { stage: true } });
    const target = await loadStage(tx, node.workspaceId, input.stageId);
    if (target.pipelineId !== deal.pipelineId) throw invalid("other_pipeline", "A deal cannot move to another pipeline");
    if (input.lostReasonId) {
      const r = await tx.lostReason.findFirst({ where: { id: input.lostReasonId, workspaceId: node.workspaceId } });
      if (!r) throw invalid("invalid_reason", "Unknown lost reason");
    }

    let next;
    try {
      next = applyStageMove(deal, target, { lostReasonId: input.lostReasonId }, new Date());
    } catch (e) {
      return asApi(e);
    }
    const now = new Date();
    const position = await placeInStage(tx, target.id, { afterId: input.afterId, beforeId: input.beforeId }, dealId);
    await tx.deal.update({
      where: { nodeId: dealId },
      data: {
        stageId: next.stageId,
        wonAt: next.wonAt,
        lostAt: next.lostAt,
        lostReasonId: next.lostReasonId,
        stageEnteredAt: next.stageEnteredAt,
        ...(deal.stageId !== target.id ? { lastActivityAt: now } : {}),
      },
    });
    await tx.node.update({ where: { id: dealId }, data: { position } });
    publishBoard(node.workspaceId, userId);

    if (deal.companyId && deal.stageId !== target.id) {
      const co = await tx.company.findUniqueOrThrow({ where: { nodeId: deal.companyId } });
      const event = target.isWon ? "won" : target.order > deal.stage.order && !target.isLost ? "advanced" : null;
      const lifecycle = event ? lifecycleAfterDeal(co.lifecycleStage, event) : co.lifecycleStage;
      if (lifecycle !== co.lifecycleStage) await tx.company.update({ where: { nodeId: co.nodeId }, data: { lifecycleStage: lifecycle } });
    }
    if (target.isWon && deal.stageId !== target.id) {
      won = { workspaceId: node.workspaceId, title: node.title, amount: `${toNum(deal.amount)} ${deal.currency}` };
      const admins = await tx.membership.findMany({ where: { workspaceId: node.workspaceId, role: { in: ["OWNER", "ADMIN"] } }, select: { userId: true } });
      const who = new Set([...admins.map((a) => a.userId), ...(deal.ownerId ? [deal.ownerId] : [])]);
      who.delete(userId);
      for (const id of who) await notify({ userId: id, workspaceId: node.workspaceId, kind: "deal_won", title: `Deal won: ${node.title}`, body: `${toNum(deal.amount)} ${deal.currency}`, url: `/crm?deal=${dealId}`, dedupeKey: `won:${dealId}`, payload: { dealId } }, tx);
    }
    if (deal.stageId !== target.id) {
      await tx.dealStageEvent.create({ data: { dealId, workspaceId: node.workspaceId, pipelineId: deal.pipelineId, fromStageId: deal.stageId, toStageId: target.id, actorId: userId, at: now } });
      await logActivity(tx, { workspaceId: node.workspaceId, nodeId: dealId, actorId: userId, action: "deal.moved", diff: { from: deal.stage.name, to: target.name } });
    }
    return getDealIn(tx, userId, dealId);
  });
  const w = won as { workspaceId: string; title: string; amount: string } | null;
  if (w) await emitWebhook(w.workspaceId, "deal.won", { dealId, title: w.title, amount: w.amount });
  if (w) await announceToSlack(w.workspaceId, "deal_won", { title: `Deal won: ${w.title}`, body: w.amount, url: `/crm?deal=${dealId}` });
  return out;
}

async function pipelineStageFor(tx: Tx, dealId: string, kind: "won" | "lost" | "open") {
  const deal = await tx.deal.findUniqueOrThrow({ where: { nodeId: dealId } });
  const stages = await tx.pipelineStage.findMany({ where: { pipelineId: deal.pipelineId }, orderBy: { order: "asc" } });
  const stage = kind === "won" ? stages.find((s) => s.isWon) : kind === "lost" ? stages.find((s) => s.isLost) : stages.find((s) => !s.isWon && !s.isLost);
  if (!stage) throw invalid("no_stage", `The pipeline has no ${kind} stage`);
  return stage.id;
}

export async function winDeal(userId: string, dealId: string) {
  const stageId = await db.$transaction(async (tx) => {
    await loadCrmNode(tx, userId, dealId, "DEAL", true);
    return pipelineStageFor(tx, dealId, "won");
  });
  return moveDeal(userId, dealId, { stageId });
}

export async function loseDeal(userId: string, dealId: string, lostReasonId: string) {
  const stageId = await db.$transaction(async (tx) => {
    await loadCrmNode(tx, userId, dealId, "DEAL", true);
    return pipelineStageFor(tx, dealId, "lost");
  });
  return moveDeal(userId, dealId, { stageId, lostReasonId });
}

export async function reopenDeal(userId: string, dealId: string, stageId?: string) {
  const target =
    stageId ??
    (await db.$transaction(async (tx) => {
      await loadCrmNode(tx, userId, dealId, "DEAL", true);
      return pipelineStageFor(tx, dealId, "open");
    }));
  return moveDeal(userId, dealId, { stageId: target });
}

// ── project from deal ──────────────────────────────────────────────────────

/**
 * Starts delivery for a deal: a project from a template, linked to the deal (`DEAL_PROJECT`), named and
 * dated from the deal. Winning and creating are separate steps so a plan limit can never block a sale.
 */
export async function createProjectFromDeal(userId: string, dealId: string, input: z.infer<typeof createProjectFromDealSchema>) {
  const { result, changes } = await transact(userId, async (ctx) => {
    const { tx } = ctx;
    const dealNode = await loadCrmNode(tx, userId, dealId, "DEAL", true);
    const deal = await tx.deal.findUniqueOrThrow({ where: { nodeId: dealId }, include: { stage: true } });
    if (deal.stage.isLost) throw invalid("deal_lost", "A lost deal cannot start a project");

    const start = input.startDate ? new Date(input.startDate) : (deal.wonAt ?? new Date());
    const project = await createProjectIn(ctx, dealNode.workspaceId, {
      name: input.name ?? dealNode.title,
      description: deal.companyId ? `Client project for deal "${dealNode.title}"` : null,
      startDate: start.toISOString(),
      dueDate: input.dueDate === undefined ? undefined : input.dueDate,
      template: input.template,
      templateId: input.templateId,
      dealId,
      companyId: deal.companyId ?? undefined,
    });
    await tx.nodeLink.create({ data: { fromNodeId: dealId, toNodeId: project.id, kind: "DEAL_PROJECT" } });
    await logActivity(tx, { workspaceId: dealNode.workspaceId, nodeId: dealId, actorId: userId, action: "deal.project_created", diff: { projectId: project.id } });
    await tx.crmActivity.create({
      data: { workspaceId: dealNode.workspaceId, type: "NOTE", subject: `Project created: ${project.title}`, ownerId: userId, dealId, companyId: deal.companyId, contactId: deal.primaryContactId, completedAt: new Date() },
    });
    return project;
  });
  return { project: { id: result.id, title: result.title, startDate: result.startDate, dueDate: result.dueDate }, changes };
}

// ── reads ──────────────────────────────────────────────────────────────────

export async function getDeal(userId: string, dealId: string) {
  return db.$transaction((tx) => getDealIn(tx, userId, dealId));
}

export async function getDealIn(tx: Tx, userId: string, dealId: string) {
  const node = await loadCrmNode(tx, userId, dealId, "DEAL");
  const now = new Date();
  const d = await tx.deal.findUniqueOrThrow({ where: { nodeId: dealId }, include: cardInclude });
  const [stages, activities, links, tags, lostReason, owner] = await Promise.all([
    tx.pipelineStage.findMany({ where: { pipelineId: d.pipelineId }, orderBy: { order: "asc" } }),
    tx.crmActivity.findMany({ where: { dealId }, orderBy: [{ createdAt: "desc" }], take: 50, include: { owner: { select: { id: true, name: true, email: true } } } }),
    tx.nodeLink.findMany({ where: { kind: "DEAL_PROJECT", fromNodeId: dealId, to: { archivedAt: null } }, select: { to: { select: { id: true, title: true, progress: true, health: true, startDate: true, dueDate: true } } } }),
    tx.nodeTag.findMany({ where: { nodeId: dealId }, select: { tag: { select: { id: true, name: true, color: true } } } }),
    d.lostReasonId ? tx.lostReason.findUnique({ where: { id: d.lostReasonId } }) : Promise.resolve(null),
    d.ownerId ? tx.user.findUnique({ where: { id: d.ownerId }, select: { id: true, name: true, email: true } }) : Promise.resolve(null),
  ]);
  return {
    ...toCard(d, now),
    pipelineId: d.pipelineId,
    source: d.source,
    manualProbability: d.probability,
    createdAt: node.createdAt,
    stages: stages.map((s) => ({ id: s.id, name: s.name, order: s.order, probability: s.probability, isWon: s.isWon, isLost: s.isLost })),
    lostReason: lostReason?.name ?? null,
    owner,
    activities,
    projects: links.map((l) => l.to),
    tags: tags.map((t) => t.tag),
  };
}

export const listDealsSchema = z.object({
  pipelineId: z.string().optional(),
  stageId: z.string().optional(),
  ownerId: z.string().optional(),
  companyId: z.string().optional(),
  status: z.enum(["open", "won", "lost"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

function dealWhere(workspaceId: string, f: Partial<z.infer<typeof listDealsSchema>>): Prisma.DealWhereInput {
  return {
    workspaceId,
    node: { archivedAt: null, ...(f.q ? { title: { contains: f.q, mode: "insensitive" as const } } : {}) },
    ...(f.pipelineId ? { pipelineId: f.pipelineId } : {}),
    ...(f.stageId ? { stageId: f.stageId } : {}),
    ...(f.ownerId ? { ownerId: f.ownerId } : {}),
    ...(f.companyId ? { companyId: f.companyId } : {}),
    ...(f.status ? { stage: f.status === "won" ? { isWon: true } : f.status === "lost" ? { isLost: true } : { isWon: false, isLost: false } } : {}),
  };
}

export async function listDeals(userId: string, workspaceId: string, f: z.infer<typeof listDealsSchema>) {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:full");
  const where = dealWhere(workspaceId, f);
  const { skip, take, page, pageSize } = pageArgs(f);
  const [total, rows] = await Promise.all([db.deal.count({ where }), db.deal.findMany({ where, include: cardInclude, orderBy: { node: { createdAt: "desc" } }, skip, take })]);
  const now = new Date();
  return { total, page, pageSize, items: rows.map((r) => toCard(r, now)) };
}

export interface BoardColumn {
  id: string;
  name: string;
  order: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
  deals: DealCard[];
  totals: ColumnTotals;
  /** Closed columns show only the latest cards. */
  truncated: boolean;
}

const CLOSED_LIMIT = 100;

export const boardSchema = z.object({ ownerId: z.string().optional(), q: z.string().trim().max(100).optional() });

export async function getBoard(userId: string, pipelineId: string, f: z.infer<typeof boardSchema>) {
  const pipeline = await db.pipeline.findUnique({ where: { id: pipelineId }, include: { stages: { orderBy: { order: "asc" } } } });
  if (!pipeline) throw notFound("pipeline");
  await loadWorkspaceMember(db, userId, pipeline.workspaceId, "crm:full");
  const rows = await db.deal.findMany({ where: dealWhere(pipeline.workspaceId, { pipelineId, ownerId: f.ownerId, q: f.q }), include: cardInclude });
  const now = new Date();
  const cards = rows.map((r) => toCard(r, now));

  const columns: BoardColumn[] = pipeline.stages.map((s) => {
    let deals = cards.filter((c) => c.stageId === s.id);
    let truncated = false;
    if (s.isWon || s.isLost) {
      deals.sort((a, b) => ((s.isWon ? b.wonAt : b.lostAt)?.getTime() ?? 0) - ((s.isWon ? a.wonAt : a.lostAt)?.getTime() ?? 0));
      if (deals.length > CLOSED_LIMIT) {
        deals = deals.slice(0, CLOSED_LIMIT);
        truncated = true;
      }
    } else {
      deals.sort((a, b) => a.position - b.position);
    }
    return {
      id: s.id,
      name: s.name,
      order: s.order,
      probability: s.probability,
      isWon: s.isWon,
      isLost: s.isLost,
      deals,
      truncated,
      totals: columnTotals(cards.filter((c) => c.stageId === s.id)),
    };
  });
  return { pipeline: { id: pipeline.id, name: pipeline.name, workspaceId: pipeline.workspaceId }, columns, serverTime: now.toISOString() };
}

