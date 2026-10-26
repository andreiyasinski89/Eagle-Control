import type { Health, LifecycleStage } from "@prisma/client";

export class DealRuleError extends Error {
  constructor(
    public readonly code: "lost_reason_required" | "no_open_stage" | "invalid_stages",
    message?: string,
  ) {
    super(message ?? code);
  }
}

export interface StageInfo {
  id: string;
  name: string;
  order: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
}

export type DealStatus = "open" | "won" | "lost";

export function stageStatus(stage: Pick<StageInfo, "isWon" | "isLost">): DealStatus {
  return stage.isWon ? "won" : stage.isLost ? "lost" : "open";
}

/** Won is 100% and lost is 0% whatever was typed; otherwise a manual value beats the stage default. */
export function effectiveProbability(stage: StageInfo, manual: number | null): number {
  if (stage.isWon) return 100;
  if (stage.isLost) return 0;
  return manual ?? stage.probability;
}

export interface DealStageState {
  stageId: string;
  wonAt: Date | null;
  lostAt: Date | null;
  lostReasonId: string | null;
  stageEnteredAt: Date;
}

export interface StageMoveInput {
  lostReasonId?: string | null;
}

/** The fields a stage change rewrites. A move to the same stage changes nothing. */
export function applyStageMove(prev: DealStageState, target: StageInfo, input: StageMoveInput, now: Date): DealStageState {
  if (target.isLost && !input.lostReasonId) {
    throw new DealRuleError("lost_reason_required", "A reason is required to mark a deal as lost");
  }
  return {
    stageId: target.id,
    wonAt: target.isWon ? (prev.wonAt ?? now) : null,
    lostAt: target.isLost ? (prev.lostAt ?? now) : null,
    lostReasonId: target.isLost ? (input.lostReasonId ?? null) : null,
    stageEnteredAt: prev.stageId === target.id ? prev.stageEnteredAt : now,
  };
}

/** A pipeline needs ≥1 open stage, exactly one won and exactly one lost stage, and unique orders. */
export function validateStages(stages: readonly Pick<StageInfo, "isWon" | "isLost" | "probability">[]): void {
  const won = stages.filter((s) => s.isWon).length;
  const lost = stages.filter((s) => s.isLost).length;
  const open = stages.filter((s) => !s.isWon && !s.isLost).length;
  if (won !== 1 || lost !== 1) throw new DealRuleError("invalid_stages", "A pipeline needs exactly one won and one lost stage");
  if (open < 1) throw new DealRuleError("no_open_stage", "A pipeline needs at least one open stage");
  if (stages.some((s) => s.probability < 0 || s.probability > 100)) throw new DealRuleError("invalid_stages", "Probability must be 0–100");
}

export interface MoneyLine {
  amount: number;
  currency: string;
  probability: number;
}

export interface ColumnTotals {
  count: number;
  /** Per currency: nothing is converted, so mixed currencies are never summed together. */
  byCurrency: Record<string, { amount: number; weighted: number }>;
}

export function columnTotals(deals: readonly MoneyLine[]): ColumnTotals {
  const byCurrency: ColumnTotals["byCurrency"] = {};
  for (const d of deals) {
    const cur = (byCurrency[d.currency] ??= { amount: 0, weighted: 0 });
    cur.amount += d.amount;
    cur.weighted += (d.amount * d.probability) / 100;
  }
  for (const c of Object.values(byCurrency)) {
    c.amount = Math.round(c.amount * 100) / 100;
    c.weighted = Math.round(c.weighted * 100) / 100;
  }
  return { count: deals.length, byCurrency };
}

export interface DealHealthInput {
  status: DealStatus;
  lastActivityAt: Date | null;
  stageEnteredAt: Date;
  nextStep: string | null;
  nextStepAt: Date | null;
  expectedCloseDate: Date | null;
}

export interface DealHealthOptions {
  /** Days without any activity before a deal turns red (yellow from half of it). */
  staleDays?: number;
  /** Days in one stage before a deal turns red. */
  stuckDays?: number;
}

const DAY = 86_400_000;
const day = (d: Date) => Math.floor(d.getTime() / DAY);

/**
 * Stagnation heatmap for open deals.
 *  RED: silent for > staleDays, stuck in the stage for > stuckDays, or the close date has passed.
 *  YELLOW: no next step (or it is overdue), or silent for > staleDays / 2.
 */
export function dealHealth(deal: DealHealthInput, today: Date, opts: DealHealthOptions = {}): Health {
  if (deal.status !== "open") return "GREEN";
  const stale = opts.staleDays ?? 14;
  const stuck = opts.stuckDays ?? 30;
  const now = day(today);
  const idle = now - day(deal.lastActivityAt ?? deal.stageEnteredAt);
  const inStage = now - day(deal.stageEnteredAt);

  if (idle > stale || inStage > stuck) return "RED";
  if (deal.expectedCloseDate && day(deal.expectedCloseDate) < now) return "RED";
  if (!deal.nextStep?.trim()) return "YELLOW";
  if (deal.nextStepAt && day(deal.nextStepAt) < now) return "YELLOW";
  if (idle > stale / 2) return "YELLOW";
  return "GREEN";
}

export type DealEvent = "created" | "advanced" | "won";

/** Companies grow with the relationship: lead → prospect once a deal progresses, customer on the first win. */
export function lifecycleAfterDeal(current: LifecycleStage, event: DealEvent): LifecycleStage {
  if (event === "won") return "CUSTOMER";
  if (event === "advanced" && current === "LEAD") return "PROSPECT";
  if (event === "created" && current === "CHURNED") return "PROSPECT";
  return current;
}
