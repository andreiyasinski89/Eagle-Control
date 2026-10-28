import { z } from "zod";
import { db } from "@/server/db";
import { detectSeries, type EventRow } from "@/modules/nodes/repeat-detect";
import { isValidTimeZone } from "@/modules/views/tz";
import { notFound } from "@/server/http/errors";
import { loadNode } from "./access";
import { archiveNode, patchNode, transact } from "./ops";

export const mergeRepeatsSchema = z.object({ keep: z.array(z.string().min(1)).min(1).max(200) });

/** The events of a project as the detector reads them, and the zone their hours are judged in: the person's own. */
async function loadEvents(userId: string, projectId: string) {
  const { node } = await loadNode(db, userId, projectId, "node:write");
  if (node.type !== "PROJECT") throw notFound("project");
  const [rows, me] = await Promise.all([
    db.node.findMany({ where: { rootId: projectId, type: "EVENT", archivedAt: null }, orderBy: { createdAt: "asc" }, take: 3000, select: { id: true, title: true, data: true } }),
    db.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
  ]);
  const tz = me?.timezone && isValidTimeZone(me.timezone) ? me.timezone : "UTC";
  const data = new Map(rows.map((r) => [r.id, r.data as Record<string, unknown>]));
  const events: EventRow[] = rows.flatMap((r) => {
    const d = r.data as { startsAt?: string; endsAt?: string; attendeeIds?: string[]; repeat?: unknown };
    return d.startsAt ? [{ id: r.id, title: r.title, startsAt: d.startsAt, endsAt: d.endsAt, attendeeIds: d.attendeeIds, repeating: !!d.repeat }] : [];
  });
  return { events, tz, data };
}

/** What could be merged into series in a project: nothing is changed. */
export async function projectRepeats(userId: string, projectId: string) {
  const { events, tz } = await loadEvents(userId, projectId);
  const series = detectSeries(events, tz);
  return { series: series.map((s) => ({ keepId: s.keepId, title: s.title, count: s.count, extra: s.dropIds.length, first: s.first, last: s.last, time: s.time, freq: s.rule.freq, interval: s.rule.interval, skipped: s.rule.skip.length })) };
}

/**
 * Turns the chosen findings into series: the earliest event of each keeps its place and gets the rule (to the last date that was entered,
 * so nothing appears that was not there before), the others are archived and can be restored. The findings are worked out again here,
 * so only what is really a series can be merged, whatever the request says.
 */
export async function mergeRepeats(userId: string, projectId: string, keep: readonly string[]) {
  const { events, tz, data } = await loadEvents(userId, projectId);
  const chosen = detectSeries(events, tz).filter((s) => keep.includes(s.keepId));
  const { result } = await transact(userId, async (ctx) => {
    let archived = 0;
    for (const s of chosen) {
      await patchNode(ctx, s.keepId, { data: { ...(data.get(s.keepId) ?? {}), attendeeIds: s.attendeeIds, repeat: s.rule } });
      for (const id of s.dropIds) {
        await archiveNode(ctx, id);
        archived++;
      }
    }
    return { merged: chosen.length, archived };
  });
  return result;
}
