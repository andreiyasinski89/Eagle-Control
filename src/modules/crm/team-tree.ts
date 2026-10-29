/** How the team map colours a partner: green is at work, yellow slowed down, red went quiet or is a newcomer who has not started. */
export type Heat = "green" | "yellow" | "red";

export interface HeatSettings {
  /** Up to this many days since the last sign of work the partner is green. */
  greenDays: number;
  /** Up to this many days yellow; later red. */
  yellowDays: number;
  /** A newcomer with no work at all after this many days since joining is red. */
  newcomerDays: number;
}
export const DEFAULT_HEAT: HeatSettings = { greenDays: 3, yellowDays: 7, newcomerDays: 7 };
export const DEFAULT_DEPTH = 3;
export const MAX_DEPTH = 6;

const whole = (v: unknown, fallback: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback);

/** The thresholds as stored: whole days, and yellow never ends before green does. */
export function cleanHeat(raw: unknown): HeatSettings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const greenDays = whole(r.greenDays, DEFAULT_HEAT.greenDays, 1, 60);
  const yellowDays = Math.max(greenDays + 1, whole(r.yellowDays, DEFAULT_HEAT.yellowDays, 2, 90));
  return { greenDays, yellowDays, newcomerDays: whole(r.newcomerDays, DEFAULT_HEAT.newcomerDays, 1, 90) };
}

/**
 * The colour of a partner by the last sign of work (null when there never was one) and the day they joined.
 * A newcomer whose first 30 days were started more than `newcomerDays` ago and are not finished is red, whatever else they did.
 */
export function heatOf(lastAt: Date | null, since: Date, now: Date, s: HeatSettings = DEFAULT_HEAT, onboarding: { startedAt: Date; finished: boolean } | null = null): Heat {
  const day = 86_400_000;
  if (onboarding && !onboarding.finished && (now.getTime() - onboarding.startedAt.getTime()) / day > s.newcomerDays) return "red";
  if (!lastAt) return (now.getTime() - since.getTime()) / day > s.newcomerDays ? "red" : "yellow";
  const days = (now.getTime() - lastAt.getTime()) / day;
  return days <= s.greenDays ? "green" : days <= s.yellowDays ? "yellow" : "red";
}

export interface TreePartner {
  id: string;
  parentId: string | null;
}

/**
 * The partners from `rootId` down to `depth` levels (1 is the direct line). `rootId` null starts from everyone without a partner above.
 * Each result carries its level and whether more partners hang below it that were cut off, so the map can load them on a click.
 */
export function sliceTree<T extends TreePartner>(all: readonly T[], rootId: string | null, depth: number): { node: T; level: number; hasMore: boolean }[] {
  const kids = new Map<string | null, T[]>();
  for (const p of all) kids.set(p.parentId, [...(kids.get(p.parentId) ?? []), p]);
  const out: { node: T; level: number; hasMore: boolean }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, level: number) => {
    for (const p of kids.get(parent) ?? []) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const below = kids.get(p.id) ?? [];
      out.push({ node: p, level, hasMore: level >= depth && below.length > 0 });
      if (level < depth) walk(p.id, level + 1);
    }
  };
  walk(rootId, 1);
  return out;
}

export interface MapFilters {
  level: number | null;
  city: string | null;
  heat: Heat | null;
}
export const NO_MAP_FILTERS: MapFilters = { level: null, city: null, heat: null };

/**
 * Applies the filters and keeps the way up: a partner who matches stays connected to the root through the ones above,
 * which are kept (and shown as only a path) so that the tree does not fall apart.
 */
export function filterTree<T extends { id: string; parentId: string | null; level: number; city: string | null; heat: Heat }>(nodes: readonly T[], f: MapFilters): { node: T; path: boolean }[] {
  const by = new Map(nodes.map((n) => [n.id, n]));
  const match = (n: T) => (f.level === null || n.level === f.level) && (f.city === null || (n.city ?? "").trim().toLowerCase() === f.city.trim().toLowerCase()) && (f.heat === null || n.heat === f.heat);
  if (f.level === null && f.city === null && f.heat === null) return nodes.map((node) => ({ node, path: false }));
  const keep = new Map<string, boolean>();
  for (const n of nodes) {
    if (!match(n)) continue;
    keep.set(n.id, false);
    for (let up = n.parentId ? by.get(n.parentId) : undefined, i = 0; up && i < 50; up = up.parentId ? by.get(up.parentId) : undefined, i++) if (!keep.has(up.id)) keep.set(up.id, true);
  }
  return nodes.filter((n) => keep.has(n.id)).map((node) => ({ node, path: keep.get(node.id) === true }));
}
