/** What the platform counts by itself from the team and the CRM; anything else the person fills in by hand. */
export const AUTO_METRICS = ["clients", "partnersFirstLine", "teamSize", "invitesMonth"] as const;
export type AutoMetric = (typeof AUTO_METRICS)[number];
export type AutoValues = Record<AutoMetric, number>;

export interface RankCriterion {
  id: string;
  label: string;
  target: number;
  /** Counted by the platform; null means the person types the value. */
  auto: AutoMetric | null;
}
export interface Rank {
  id: string;
  name: string;
  criteria: RankCriterion[];
}
export interface RankState {
  currentRankId: string | null;
  /** The day the person wants to reach the next rank by (YYYY-MM-DD). */
  targetDate: string | null;
  manual: Record<string, { value: number; at: string }>;
}

export const MAX_RANKS = 20;
export const MAX_CRITERIA = 12;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const whole = (v: unknown, min: number, max: number, fb: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fb);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The leader's ladder as stored: ranks in order, each with criteria that have a name and a target above zero. Ids stay as given so values typed by hand keep their place. */
export function cleanRanks(raw: unknown): Rank[] {
  if (!Array.isArray(raw)) return [];
  const used = new Set<string>();
  const uid = (v: unknown, prefix: string, n: number) => {
    let id = text(v, 40).replace(/[^\w-]/g, "") || `${prefix}${n}`;
    while (used.has(id)) id = `${id}x`;
    used.add(id);
    return id;
  };
  const out: Rank[] = [];
  for (const r of raw.slice(0, MAX_RANKS)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const name = text(o.name, 60);
    if (!name) continue;
    const criteria: RankCriterion[] = [];
    for (const c of (Array.isArray(o.criteria) ? o.criteria : []).slice(0, MAX_CRITERIA)) {
      if (!c || typeof c !== "object") continue;
      const k = c as Record<string, unknown>;
      const label = text(k.label, 80);
      if (!label) continue;
      criteria.push({ id: uid(k.id, "c", criteria.length + 1), label, target: Math.max(1, whole(k.target, 1, 1_000_000, 1)), auto: (AUTO_METRICS as readonly unknown[]).includes(k.auto) ? (k.auto as AutoMetric) : null });
    }
    out.push({ id: uid(o.id, "r", out.length + 1), name, criteria });
  }
  return out;
}

export const emptyState = (): RankState => ({ currentRankId: null, targetDate: null, manual: {} });

export function cleanState(raw: unknown): RankState {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const manual: RankState["manual"] = {};
  if (o.manual && typeof o.manual === "object") {
    for (const [k, v] of Object.entries(o.manual as Record<string, unknown>)) {
      const m = v as { value?: unknown; at?: unknown } | null;
      if (m && typeof m.value === "number" && Number.isFinite(m.value) && typeof m.at === "string") manual[k] = { value: Math.max(0, Math.round(m.value)), at: m.at };
    }
  }
  return { currentRankId: text(o.currentRankId, 40) || null, targetDate: typeof o.targetDate === "string" && DAY.test(o.targetDate) ? o.targetDate : null, manual };
}

export interface CriterionStatus {
  id: string;
  label: string;
  target: number;
  value: number;
  /** 0 to 100. */
  percent: number;
  auto: AutoMetric | null;
  /** When the value typed by hand was last set. */
  updatedAt: string | null;
  /** What is still missing, and how much of it each remaining day has to bring (null without a deadline or after it). */
  left: number;
  perDay: number | null;
}

export interface RankStatus {
  current: { id: string; name: string } | null;
  next: { id: string; name: string } | null;
  /** The average of the criteria, 0 to 100; 100 when there is nothing left to reach. */
  percent: number;
  criteria: CriterionStatus[];
  targetDate: string | null;
  /** Whole days from today to the target day; negative once it has passed, null without one. */
  daysLeft: number | null;
  reached: boolean;
}

const dayNumber = (d: string) => Math.floor(new Date(`${d}T00:00:00Z`).getTime() / 86_400_000);

/**
 * Where the person stands on the way to the next rank: the rank after the current one (the first when none is chosen),
 * each criterion against its target, and how much a day it takes to make it by the target day. `today` is the person's own day.
 */
export function evaluateRank(ranks: readonly Rank[], state: RankState, auto: AutoValues, today: string): RankStatus {
  const at = state.currentRankId ? ranks.findIndex((r) => r.id === state.currentRankId) : -1;
  const current = at >= 0 ? ranks[at] : undefined;
  const next = ranks[at + 1];
  const daysLeft = state.targetDate ? dayNumber(state.targetDate) - dayNumber(today) : null;
  const criteria: CriterionStatus[] = (next?.criteria ?? []).map((c) => {
    const manual = state.manual[c.id];
    const value = c.auto ? auto[c.auto] : (manual?.value ?? 0);
    const left = Math.max(0, c.target - value);
    return {
      id: c.id,
      label: c.label,
      target: c.target,
      value,
      percent: Math.min(100, Math.round((value / c.target) * 100)),
      auto: c.auto,
      updatedAt: c.auto ? null : (manual?.at ?? null),
      left,
      perDay: left > 0 && daysLeft !== null && daysLeft > 0 ? Math.ceil((left / daysLeft) * 10) / 10 : null,
    };
  });
  const percent = criteria.length ? Math.round(criteria.reduce((n, c) => n + c.percent, 0) / criteria.length) : next ? 0 : 100;
  return {
    current: current ? { id: current.id, name: current.name } : null,
    next: next ? { id: next.id, name: next.name } : null,
    percent,
    criteria,
    targetDate: state.targetDate,
    daysLeft,
    reached: !!next && criteria.length > 0 && criteria.every((c) => c.left === 0),
  };
}
