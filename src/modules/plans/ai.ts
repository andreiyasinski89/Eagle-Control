import type { Plan } from "@prisma/client";

/** Tokens (input + output) a workspace may use per calendar month. Free has no AI. */
export const AI_MONTHLY_TOKENS: Record<Plan, number> = { FREE: 0, PRO: 1_000_000, ENTERPRISE: 10_000_000 };

export const AI_WARN_AT = 0.8;

export const monthStart = (now: Date): Date => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
export const monthKey = (now: Date): string => now.toISOString().slice(0, 7);

export interface QuotaState {
  quota: number;
  used: number;
  remaining: number;
  /** 0–1+; 1 means the allowance is spent. */
  ratio: number;
  warn: boolean;
  exhausted: boolean;
}

export function quotaState(plan: Plan, used: number): QuotaState {
  const quota = AI_MONTHLY_TOKENS[plan];
  const ratio = quota === 0 ? 1 : used / quota;
  return { quota, used, remaining: Math.max(0, quota - used), ratio, warn: quota > 0 && ratio >= AI_WARN_AT && ratio < 1, exhausted: quota === 0 || used >= quota };
}
