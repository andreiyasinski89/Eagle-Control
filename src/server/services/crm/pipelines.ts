import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { ApiError, conflict, limitReached, notFound } from "@/server/http/errors";
import { checkLimit } from "@/modules/plans";
import { DEFAULT_STAGES } from "@/modules/crm/defaults";
import { DealRuleError, validateStages } from "@/modules/crm/deal-rules";
import { loadWorkspaceMember, type Tx } from "@/server/services/nodes/access";
import { invalid } from "./common";

export const stageInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  probability: z.number().int().min(0).max(100),
  isWon: z.boolean().default(false),
  isLost: z.boolean().default(false),
});
export type StageInput = z.infer<typeof stageInputSchema>;

export const createPipelineSchema = z.object({
  name: z.string().trim().min(1).max(60),
  stages: z.array(stageInputSchema).min(3).max(20).optional(),
});

export const replaceStagesSchema = z.object({
  stages: z.array(stageInputSchema).min(3).max(20),
  /** Where deals of a deleted stage go: removed stage id → target stage id. */
  moveDealsTo: z.record(z.string()).default({}),
});

const asApi = (e: unknown): never => {
  if (e instanceof DealRuleError) throw invalid(e.code, e.message);
  throw e;
};

export async function listPipelines(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  return db.pipeline.findMany({
    where: { workspaceId },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: { stages: { orderBy: { order: "asc" } } },
  });
}

async function loadPipeline(tx: Tx, userId: string, pipelineId: string, action: "crm:read" | "pipeline:manage") {
  const p = await tx.pipeline.findUnique({ where: { id: pipelineId }, include: { stages: { orderBy: { order: "asc" } } } });
  if (!p) throw notFound("pipeline");
  await loadWorkspaceMember(tx, userId, p.workspaceId, action);
  return p;
}

export async function createPipeline(userId: string, workspaceId: string, input: z.infer<typeof createPipelineSchema>) {
  return db.$transaction(async (tx) => {
    const ws = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { plan: true } });
    await loadWorkspaceMember(tx, userId, workspaceId, "pipeline:manage");
    const count = await tx.pipeline.count({ where: { workspaceId } });
    const check = checkLimit(ws.plan, "pipelines", count);
    if (!check.allowed) throw limitReached(check.limit, "pipelines");

    const stages = input.stages ?? DEFAULT_STAGES.map((s) => ({ name: s.name, probability: s.probability, isWon: s.isWon ?? false, isLost: s.isLost ?? false }));
    try {
      validateStages(stages);
    } catch (e) {
      asApi(e);
    }
    return tx.pipeline.create({
      data: {
        workspaceId,
        name: input.name,
        isDefault: count === 0,
        stages: { create: stages.map((s, order) => ({ name: s.name, order, probability: s.probability, isWon: s.isWon, isLost: s.isLost })) },
      },
      include: { stages: { orderBy: { order: "asc" } } },
    });
  });
}

export async function renamePipeline(userId: string, pipelineId: string, patch: { name?: string; isDefault?: boolean }) {
  return db.$transaction(async (tx) => {
    const p = await loadPipeline(tx, userId, pipelineId, "pipeline:manage");
    if (patch.isDefault) await tx.pipeline.updateMany({ where: { workspaceId: p.workspaceId }, data: { isDefault: false } });
    return tx.pipeline.update({ where: { id: p.id }, data: { name: patch.name, isDefault: patch.isDefault } });
  });
}

export async function deletePipeline(userId: string, pipelineId: string) {
  await db.$transaction(async (tx) => {
    const p = await loadPipeline(tx, userId, pipelineId, "pipeline:manage");
    const total = await tx.pipeline.count({ where: { workspaceId: p.workspaceId } });
    if (total <= 1) throw conflict("last_pipeline", "A workspace needs at least one pipeline");
    const deals = await tx.deal.count({ where: { pipelineId: p.id, node: { archivedAt: null } } });
    if (deals > 0) throw new ApiError(409, "pipeline_not_empty", "Move or archive its deals first", { deals });
    await tx.leadForm.deleteMany({ where: { pipelineId: p.id } });
    await tx.pipeline.delete({ where: { id: p.id } });
    if (p.isDefault) {
      const next = await tx.pipeline.findFirst({ where: { workspaceId: p.workspaceId }, orderBy: { name: "asc" } });
      if (next) await tx.pipeline.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
}

/**
 * Replaces a pipeline's stages in one go (reorder, rename, add, remove). Deals in removed stages
 * need a destination; a stage that holds deals cannot change between open / won / lost.
 */
export async function replaceStages(userId: string, pipelineId: string, input: z.infer<typeof replaceStagesSchema>) {
  return db.$transaction(async (tx) => {
    const p = await loadPipeline(tx, userId, pipelineId, "pipeline:manage");
    try {
      validateStages(input.stages);
    } catch (e) {
      asApi(e);
    }
    const existing = new Map(p.stages.map((s) => [s.id, s]));
    for (const s of input.stages) if (s.id && !existing.has(s.id)) throw invalid("unknown_stage", "Stage does not belong to this pipeline");

    const keep = new Set(input.stages.map((s) => s.id).filter((x): x is string => !!x));
    const removed = p.stages.filter((s) => !keep.has(s.id));
    const counts = await tx.deal.groupBy({ by: ["stageId"], where: { pipelineId: p.id, node: { archivedAt: null } }, _count: true });
    const dealsIn = new Map(counts.map((c) => [c.stageId, c._count]));

    for (const s of input.stages) {
      const old = s.id ? existing.get(s.id) : undefined;
      if (old && (old.isWon !== s.isWon || old.isLost !== s.isLost) && (dealsIn.get(old.id) ?? 0) > 0) {
        throw new ApiError(409, "stage_flags_locked", `Stage "${old.name}" has deals; move them before changing its type`);
      }
    }
    for (const r of removed) {
      if ((dealsIn.get(r.id) ?? 0) === 0) continue;
      const target = input.moveDealsTo[r.id];
      const targetStage = target ? input.stages.find((s) => s.id === target) : undefined;
      if (!targetStage) throw new ApiError(409, "stage_has_deals", `Stage "${r.name}" has deals; choose where to move them`, { stageId: r.id, deals: dealsIn.get(r.id) });
      if (targetStage.isLost) throw invalid("invalid_target", "Deals cannot be bulk-moved into a lost stage");
      if (targetStage.isWon !== r.isWon) throw invalid("invalid_target", "Won deals can only move to the won stage");
    }

    // The (pipelineId, order) pair is unique: park everything out of the way, then place final orders.
    await tx.pipelineStage.updateMany({ where: { pipelineId: p.id }, data: { order: { increment: 1000 } } });
    const now = new Date();
    for (const r of removed) {
      const target = input.moveDealsTo[r.id];
      if ((dealsIn.get(r.id) ?? 0) > 0 && target) {
        await tx.deal.updateMany({ where: { stageId: r.id }, data: { stageId: target, stageEnteredAt: now } });
      }
    }
    if (removed.length) await tx.pipelineStage.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
    for (const [order, s] of input.stages.entries()) {
      const data = { name: s.name, order, probability: s.probability, isWon: s.isWon, isLost: s.isLost };
      if (s.id) await tx.pipelineStage.update({ where: { id: s.id }, data });
      else await tx.pipelineStage.create({ data: { ...data, pipelineId: p.id } });
    }
    return tx.pipeline.findUniqueOrThrow({ where: { id: p.id }, include: { stages: { orderBy: { order: "asc" } } } });
  });
}

// ── lost-reason dictionary ────────────────────────────────────────────────

export const lostReasonSchema = z.object({ name: z.string().trim().min(1).max(80) });

export async function listLostReasons(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  return db.lostReason.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
}

export async function createLostReason(userId: string, workspaceId: string, name: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "pipeline:manage");
  try {
    return await db.lostReason.create({ data: { workspaceId, name } });
  } catch (e) {
    if ((e as Prisma.PrismaClientKnownRequestError).code === "P2002") throw conflict("reason_exists", "This reason already exists");
    throw e;
  }
}

export async function deleteLostReason(userId: string, id: string) {
  const r = await db.lostReason.findUnique({ where: { id } });
  if (!r) throw notFound("reason");
  await loadWorkspaceMember(db, userId, r.workspaceId, "pipeline:manage");
  await db.lostReason.delete({ where: { id } });
}
