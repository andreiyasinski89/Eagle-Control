export const STEP = 1024;
const MIN_GAP = 1e-6;

/** Position for a node inserted between `prev` and `next` (either may be absent). */
export function between(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return STEP;
  if (prev === null) return (next as number) - STEP;
  if (next === null) return prev + STEP;
  return (prev + next) / 2;
}

/** True when float precision is running out between two neighbours. */
export function needsRebalance(prev: number | null, next: number | null): boolean {
  return prev !== null && next !== null && Math.abs(next - prev) < MIN_GAP;
}

export function evenPositions(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * STEP);
}
