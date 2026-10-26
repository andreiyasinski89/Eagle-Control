import { z } from "zod";
import type { Plan } from "@prisma/client";
import { db } from "@/server/db";
import { ApiError, forbidden, notFound } from "@/server/http/errors";
import { buildBurndown } from "@/modules/nodes/burndown";
import { hasFeature } from "@/modules/plans";
import { averageVelocity, cumulativeFlow, cycleTimes, doneInfo, histogram, sprintVelocity, throughput, type StatusEv, type Task } from "@/modules/metrics/agile";
import { loadNode } from "./nodes/access";

const DAY = 86_400_000;

/** 402 with a machine-readable feature name, so the UI can show an upgrade hint instead of an error. */
export const planFeatureRequired = (feature: string) => new ApiError(402, "plan_feature", `The ${feature} feature is part of a higher plan`, { feature });

export function requireFeature(plan: Plan, feature: "metrics"): void {
  if (!hasFeature(plan, feature)) throw planFeatureRequired(feature);
}

export const metricsQuerySchema = z.object({
  weeks: z.coerce.number().int().min(2).max(26).default(12),
  days: z.coerce.number().int().min(7).max(180).default(45),
});

/**
 * Agile metrics of one project, all replayed from the status history: velocity per sprint, burndown per sprint,
 * cumulative flow, cycle time and weekly throughput. Pro feature; clients never see them.
 */
export async function projectMetrics(userId: string, projectId: string, q: z.infer<typeof metricsQuerySchema>, now = new Date()) {
  const { node: project, membership } = await loadNode(db, userId, projectId);
  if (project.type !== "PROJECT") throw notFound("project");
  if (membership.role === "CLIENT") throw forbidden();
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: project.workspaceId }, select: { plan: true } });
  requireFeature(ws.plan, "metrics");

  const nodes = await db.node.findMany({
    where: { archivedAt: null, rootId: projectId, type: { in: ["TASK", "SPRINT"] } },
    select: { id: true, type: true, title: true, parentId: true, startDate: true, dueDate: true, estimation: true, createdAt: true },
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sprintOf = (parentId: string | null): string | null => {
    for (let id = parentId, hops = 0; id && hops < 10; hops++) {
      const p = byId.get(id);
      if (!p) return null; // reached an epic or the project (not in the filtered list)
      if (p.type === "SPRINT") return p.id;
      id = p.parentId;
    }
    return null;
  };
  const taskNodes = nodes.filter((n) => n.type === "TASK");
  const tasks: Task[] = taskNodes.map((t) => ({ id: t.id, weight: t.estimation !== null && Number(t.estimation) > 0 ? Number(t.estimation) : 1, sprintId: sprintOf(t.parentId) }));

  const rows = await db.nodeStatusEvent.findMany({ where: { projectId, nodeId: { in: taskNodes.map((t) => t.id) } }, select: { nodeId: true, at: true, fromStatus: true, toStatus: true } });
  const events: StatusEv[] = rows.map((r) => ({ nodeId: r.nodeId, at: r.at, from: r.fromStatus, to: r.toStatus }));
  const info = doneInfo(events);
  const weights = new Map(tasks.map((t) => [t.id, t.weight]));

  const sprints = nodes.filter((n) => n.type === "SPRINT").map((s) => ({ id: s.id, title: s.title, startDate: s.startDate, dueDate: s.dueDate }));
  const velocityRows = sprintVelocity(sprints, tasks, info, now);

  const burndowns = sprints
    .filter((s) => s.startDate || s.dueDate)
    .slice(0, 30)
    .map((s) => {
      const start = s.startDate ?? new Date((s.dueDate as Date).getTime() - 14 * DAY);
      const due = s.dueDate ?? new Date(start.getTime() + 14 * DAY);
      const inSprint = tasks.filter((t) => t.sprintId === s.id && info.get(t.id)?.status !== "CANCELLED");
      return { sprintId: s.id, title: s.title, points: buildBurndown(inSprint.map((t) => ({ weight: t.weight, doneAt: info.get(t.id)?.doneAt ?? null })), start, due, now) };
    });

  const from = new Date(now.getTime() - (q.days - 1) * DAY);
  const cycle = cycleTimes(events);
  return {
    project: { id: project.id, title: project.title },
    generatedAt: now.toISOString(),
    velocity: { sprints: velocityRows, average: averageVelocity(velocityRows) },
    burndowns,
    flow: cumulativeFlow(events, from, now),
    cycle: { ...cycle.summary, histogram: histogram(cycle.days, [1, 2, 3, 5, 8, 13]) },
    throughput: throughput(events, q.weeks, now, weights),
    taskCount: tasks.length,
  };
}
