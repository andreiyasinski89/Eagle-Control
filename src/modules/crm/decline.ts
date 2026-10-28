/**
 * Why a person said no, in the words people in network marketing hear most. Kept as codes so the labels follow the language
 * and the report can count them; "not specified" is the absence of a code, never a code of its own.
 */
export const DECLINE_REASONS = ["NOT_INTERESTED", "NO_MONEY", "NO_TIME", "DISTRUST_MLM", "DISTRUST_PRODUCT", "FAMILY_AGAINST", "OTHER"] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

export const isDeclineReason = (v: unknown): v is DeclineReason => typeof v === "string" && (DECLINE_REASONS as readonly string[]).includes(v);

/** The reasons of the people who said no, most frequent first; people with no reason are counted under `null`. */
export function declineStats(rows: readonly { declineReason: string | null }[]): { total: number; reasons: { reason: DeclineReason | null; count: number }[] } {
  const counts = new Map<DeclineReason | null, number>();
  for (const r of rows) {
    const key = isDeclineReason(r.declineReason) ? r.declineReason : null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const order = (k: DeclineReason | null) => (k === null ? 99 : DECLINE_REASONS.indexOf(k));
  const reasons = [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || order(a.reason) - order(b.reason));
  return { total: rows.length, reasons };
}
