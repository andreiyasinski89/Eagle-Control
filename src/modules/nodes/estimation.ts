/** The estimate as typed: empty is no estimate, "1,5" and "1.5" are the same; anything else (or out of range) is not saved. */
export function parseEstimation(raw: string): number | null | undefined {
  const v = raw.trim().replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100_000 ? n : undefined;
}
