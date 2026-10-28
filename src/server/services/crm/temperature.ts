import type { PrismaClient, Temperature } from "@prisma/client";
import { computeTemperature, manualHolds, type TempActivity } from "@/modules/crm/temperature";
import type { Stage } from "@/modules/crm/people";
import { db } from "@/server/db";
import type { Tx } from "@/server/services/nodes/access";

const DAY = 86_400_000;
/** The touches the temperature looks at reach back this far (the longest window of the rules is 60 days). */
const LOOKBACK_DAYS = 90;

type Client = Tx | PrismaClient;

/**
 * Works the temperature of one person out again from what happened with them and stores it, unless one set by hand still holds.
 * Called after a touch is done and after the person moves in the funnel. Returns the temperature now.
 */
export async function refreshTemperature(tx: Client, contactId: string, now = new Date()): Promise<Temperature | null> {
  const c = await tx.contact.findUnique({
    where: { nodeId: contactId },
    select: { stage: true, temperature: true, temperatureManualUntil: true, lastContactedAt: true, stageChangedAt: true, node: { select: { createdAt: true } } },
  });
  if (!c) return null;
  if (manualHolds(c.temperatureManualUntil, now)) return c.temperature;
  const [acts, move] = await Promise.all([
    tx.crmActivity.findMany({ where: { contactId, completedAt: { gte: new Date(now.getTime() - LOOKBACK_DAYS * DAY), lte: now } }, select: { type: true, completedAt: true, outcome: true, signals: true } }),
    tx.contactStageEvent.findFirst({ where: { contactNodeId: contactId }, orderBy: { at: "desc" }, select: { fromStage: true } }),
  ]);
  const r = computeTemperature({ stage: c.stage as Stage, createdAt: c.node.createdAt, lastContactedAt: c.lastContactedAt, stageChangedAt: c.stageChangedAt, previousStage: (move?.fromStage as Stage | null | undefined) ?? null }, acts as TempActivity[], now);
  if (r.temperature === null || r.temperature === c.temperature) return c.temperature;
  await tx.contact.update({ where: { nodeId: contactId }, data: { temperature: r.temperature } });
  return r.temperature;
}

/**
 * Works the temperature of everybody out again: the nightly job (people cool as the days pass without anyone touching them) and the
 * one-time pass over the people who had no temperature yet. People whose temperature was set by hand and still holds are left alone.
 */
export async function recalcTemperatures(opts: { workspaceId?: string; now?: Date } = {}): Promise<{ checked: number; changed: number }> {
  const now = opts.now ?? new Date();
  let checked = 0;
  let changed = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await db.contact.findMany({
      where: {
        ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}),
        stage: { notIn: ["CLIENT", "PARTNER"] },
        node: { archivedAt: null },
        OR: [{ temperatureManualUntil: null }, { temperatureManualUntil: { lte: now } }],
      },
      orderBy: { nodeId: "asc" },
      take: 500,
      ...(cursor ? { cursor: { nodeId: cursor }, skip: 1 } : {}),
      select: { nodeId: true, stage: true, temperature: true, lastContactedAt: true, stageChangedAt: true, node: { select: { createdAt: true } } },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]?.nodeId;
    const ids = rows.map((r) => r.nodeId);
    const [acts, moves] = await Promise.all([
      db.crmActivity.findMany({ where: { contactId: { in: ids }, completedAt: { gte: new Date(now.getTime() - LOOKBACK_DAYS * DAY), lte: now } }, select: { contactId: true, type: true, completedAt: true, outcome: true, signals: true } }),
      db.contactStageEvent.findMany({ where: { contactNodeId: { in: ids } }, orderBy: { at: "desc" }, select: { contactNodeId: true, fromStage: true } }),
    ]);
    const byContact = new Map<string, TempActivity[]>();
    for (const a of acts) if (a.contactId) byContact.set(a.contactId, [...(byContact.get(a.contactId) ?? []), a as TempActivity]);
    const previous = new Map<string, Stage | null>();
    for (const m of moves) if (!previous.has(m.contactNodeId)) previous.set(m.contactNodeId, (m.fromStage as Stage | null) ?? null);
    const toSet: Record<Temperature, string[]> = { HOT: [], WARM: [], COLD: [] };
    for (const r of rows) {
      checked++;
      const t = computeTemperature({ stage: r.stage as Stage, createdAt: r.node.createdAt, lastContactedAt: r.lastContactedAt, stageChangedAt: r.stageChangedAt, previousStage: previous.get(r.nodeId) ?? null }, byContact.get(r.nodeId) ?? [], now).temperature;
      if (t && t !== r.temperature) toSet[t].push(r.nodeId);
    }
    for (const t of ["HOT", "WARM", "COLD"] as const) {
      if (toSet[t].length === 0) continue;
      await db.contact.updateMany({ where: { nodeId: { in: toSet[t] } }, data: { temperature: t } });
      changed += toSet[t].length;
    }
    if (rows.length < 500) break;
  }
  return { checked, changed };
}
