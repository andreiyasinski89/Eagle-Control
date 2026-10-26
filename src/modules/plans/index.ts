import type { Plan } from "@prisma/client";

export type LimitKey = "users" | "projects" | "pipelines" | "contacts";

export const PLAN_LIMITS: Record<Plan, Record<LimitKey, number>> = {
  FREE: { users: 5, projects: 3, pipelines: 1, contacts: 500 },
  PRO: { users: Infinity, projects: Infinity, pipelines: Infinity, contacts: Infinity },
  ENTERPRISE: { users: Infinity, projects: Infinity, pipelines: Infinity, contacts: Infinity },
};

export type Feature = "integrations" | "ai" | "metrics" | "clientPortal" | "sso" | "auditLog" | "api";

const FEATURES: Record<Feature, Plan[]> = {
  integrations: ["PRO", "ENTERPRISE"],
  ai: ["PRO", "ENTERPRISE"],
  metrics: ["PRO", "ENTERPRISE"],
  clientPortal: ["PRO", "ENTERPRISE"],
  sso: ["ENTERPRISE"],
  auditLog: ["ENTERPRISE"],
  api: ["PRO", "ENTERPRISE"],
};

export function hasFeature(plan: Plan, feature: Feature): boolean {
  return FEATURES[feature].includes(plan);
}

export interface LimitCheck {
  allowed: boolean;
  limit: number;
  current: number;
}

/** `current` is the count BEFORE adding `adding` more items. */
export function checkLimit(plan: Plan, key: LimitKey, current: number, adding = 1): LimitCheck {
  const limit = PLAN_LIMITS[plan][key];
  return { allowed: current + adding <= limit, limit, current };
}
