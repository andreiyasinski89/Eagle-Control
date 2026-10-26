const DAY = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
export const monthKey = (d: Date) => d.toISOString().slice(0, 7);

export interface StageInfo {
  id: string;
  name: string;
  order: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
}

export interface StageEv {
  dealId: string;
  toStageId: string;
  at: Date;
}

export interface FunnelRow {
  stageId: string;
  name: string;
  /** Deals that reached this stage or went further (lost deals count up to the last open stage they reached). */
  reached: number;
  /** Share of the previous row that made it here; null for the first row. */
  conversion: number | null;
}

/**
 * Funnel from stage history. A deal counts for every stage up to the furthest non-lost stage it ever entered, so
 * skipping a stage does not break the funnel. Only deals that entered the pipeline inside the period count.
 */
export function funnel(stages: readonly StageInfo[], events: readonly StageEv[]): { rows: FunnelRow[]; lost: number; deals: number } {
  const order = new Map(stages.map((s) => [s.id, s]));
  const furthest = new Map<string, number>();
  const lostDeals = new Set<string>();
  for (const e of events) {
    const s = order.get(e.toStageId);
    if (!s) continue;
    if (s.isLost) {
      lostDeals.add(e.dealId);
      continue;
    }
    furthest.set(e.dealId, Math.max(furthest.get(e.dealId) ?? -1, s.order));
  }
  const open = [...stages].filter((s) => !s.isLost).sort((a, b) => a.order - b.order);
  const rows = open.map((s, i, all) => {
    const reached = [...furthest.values()].filter((o) => o >= s.order).length;
    const prev = i === 0 ? null : (all[i - 1] as StageInfo);
    const prevReached = prev ? [...furthest.values()].filter((o) => o >= prev.order).length : 0;
    return { stageId: s.id, name: s.name, reached, conversion: prev === null ? null : prevReached === 0 ? 0 : round2(reached / prevReached) };
  });
  return { rows, lost: lostDeals.size, deals: furthest.size };
}

export interface OpenDeal {
  id: string;
  amount: number;
  currency: string;
  /** deal's own probability, else the stage's (percent) */
  probability: number;
  expectedCloseDate: Date | null;
}

export interface ForecastMonth {
  month: string | "none";
  count: number;
  total: number;
  weighted: number;
}

/** Open pipeline per currency and expected-close month. Amounts are never converted between currencies. */
export function forecast(deals: readonly OpenDeal[]): Record<string, ForecastMonth[]> {
  const out: Record<string, Map<string, ForecastMonth>> = {};
  for (const d of deals) {
    const m = d.expectedCloseDate ? monthKey(d.expectedCloseDate) : "none";
    const cur = (out[d.currency] ??= new Map());
    const row = cur.get(m) ?? { month: m, count: 0, total: 0, weighted: 0 };
    row.count++;
    row.total += d.amount;
    row.weighted += (d.amount * d.probability) / 100;
    cur.set(m, row);
  }
  return Object.fromEntries(
    Object.entries(out).map(([cur, map]) => [
      cur,
      [...map.values()].map((r) => ({ ...r, total: round2(r.total), weighted: round2(r.weighted) })).sort((a, b) => (a.month === "none" ? 1 : b.month === "none" ? -1 : a.month.localeCompare(b.month))),
    ]),
  );
}

export interface ClosedDeal {
  amount: number;
  currency: string;
  outcome: "won" | "lost";
  lostReason: string | null;
  createdAt: Date;
  closedAt: Date;
  source: string | null;
}

export interface WinLoss {
  won: number;
  lost: number;
  /** won / (won + lost); null when nothing closed */
  winRate: number | null;
  wonAmount: Record<string, number>;
  lostAmount: Record<string, number>;
  reasons: { reason: string; count: number }[];
  /** days from creation to win, over won deals */
  avgCycleDays: number | null;
  medianCycleDays: number | null;
}

export function winLoss(closed: readonly ClosedDeal[]): WinLoss {
  const won = closed.filter((d) => d.outcome === "won");
  const lost = closed.filter((d) => d.outcome === "lost");
  const sum = (list: readonly ClosedDeal[]) => {
    const out: Record<string, number> = {};
    for (const d of list) out[d.currency] = round2((out[d.currency] ?? 0) + d.amount);
    return out;
  };
  const reasons = new Map<string, number>();
  for (const d of lost) reasons.set(d.lostReason ?? "—", (reasons.get(d.lostReason ?? "—") ?? 0) + 1);
  const cycles = won.map((d) => Math.max(0, (d.closedAt.getTime() - d.createdAt.getTime()) / DAY)).sort((a, b) => a - b);
  const mid = Math.floor(cycles.length / 2);
  const median = cycles.length === 0 ? null : cycles.length % 2 ? (cycles[mid] as number) : ((cycles[mid - 1] as number) + (cycles[mid] as number)) / 2;
  return {
    won: won.length,
    lost: lost.length,
    winRate: closed.length ? round2(won.length / closed.length) : null,
    wonAmount: sum(won),
    lostAmount: sum(lost),
    reasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    avgCycleDays: cycles.length ? Math.round((cycles.reduce((s, c) => s + c, 0) / cycles.length) * 10) / 10 : null,
    medianCycleDays: median === null ? null : Math.round(median * 10) / 10,
  };
}

export interface SourceRow {
  source: string;
  deals: number;
  won: number;
  /** won / deals */
  conversion: number;
  wonAmount: Record<string, number>;
}

/** Where deals come from and how well each source converts. Deals without a source are grouped as "unknown". */
export function bySource(deals: readonly { source: string | null; won: boolean; amount: number; currency: string }[]): SourceRow[] {
  const map = new Map<string, SourceRow>();
  for (const d of deals) {
    const key = d.source?.trim() || "unknown";
    const row = map.get(key) ?? { source: key, deals: 0, won: 0, conversion: 0, wonAmount: {} };
    row.deals++;
    if (d.won) {
      row.won++;
      row.wonAmount[d.currency] = round2((row.wonAmount[d.currency] ?? 0) + d.amount);
    }
    map.set(key, row);
  }
  return [...map.values()].map((r) => ({ ...r, conversion: round2(r.won / r.deals) })).sort((a, b) => b.deals - a.deals || a.source.localeCompare(b.source));
}

export interface ManagerRow {
  ownerId: string;
  calls: number;
  emails: number;
  meetings: number;
  notes: number;
  tasksDone: number;
  dealsWon: number;
  wonAmount: Record<string, number>;
}

/** Completed activities and won deals per owner in the period. */
export function managerActivity(
  activities: readonly { ownerId: string; type: "CALL" | "EMAIL" | "MESSAGE" | "MEETING" | "NOTE" | "TASK" }[],
  won: readonly { ownerId: string | null; amount: number; currency: string }[],
): ManagerRow[] {
  const map = new Map<string, ManagerRow>();
  const row = (id: string) => {
    let r = map.get(id);
    if (!r) {
      r = { ownerId: id, calls: 0, emails: 0, meetings: 0, notes: 0, tasksDone: 0, dealsWon: 0, wonAmount: {} };
      map.set(id, r);
    }
    return r;
  };
  for (const a of activities) {
    const r = row(a.ownerId);
    if (a.type === "CALL") r.calls++;
    else if (a.type === "EMAIL" || a.type === "MESSAGE") r.emails++; // chat messages count as written contact
    else if (a.type === "MEETING") r.meetings++;
    else if (a.type === "NOTE") r.notes++;
    else r.tasksDone++;
  }
  for (const d of won) {
    if (!d.ownerId) continue;
    const r = row(d.ownerId);
    r.dealsWon++;
    r.wonAmount[d.currency] = round2((r.wonAmount[d.currency] ?? 0) + d.amount);
  }
  const total = (r: ManagerRow) => r.calls + r.emails + r.meetings + r.notes + r.tasksDone;
  return [...map.values()].sort((a, b) => b.dealsWon - a.dealsWon || total(b) - total(a) || a.ownerId.localeCompare(b.ownerId));
}
