import { z } from "zod";
import { db } from "@/server/db";
import { forbidden, notFound } from "@/server/http/errors";
import { bySource, forecast, funnel, managerActivity, winLoss, type ClosedDeal, type OpenDeal } from "@/modules/metrics/sales";
import { can } from "@/server/policies";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { requireFeature } from "@/server/services/metrics";
import { toCsv } from "@/modules/crm/csv";
import { declineStats } from "@/modules/crm/decline";
import { invalid, toNum } from "./common";

const DAY = 86_400_000;

export const SECTIONS = ["funnel", "forecast", "winloss", "sources", "managers"] as const;
export const crmReportQuerySchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  pipelineId: z.string().optional(),
  format: z.enum(["json", "csv"]).default("json"),
  section: z.enum(SECTIONS).default("funnel"),
});

/**
 * Sales reports for one pipeline and period: funnel (stage entries in the period), weighted forecast of what is open now,
 * won/lost with reasons and cycle length, lead sources and manager activity. Pro feature; needs CRM access.
 */
export async function crmReport(userId: string, workspaceId: string, q: z.infer<typeof crmReportQuerySchema>) {
  const membership = await loadWorkspaceMember(db, userId, workspaceId, "crm:full");
  if (q.format === "csv" && !can(membership, "crm:export")) throw forbidden();
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { plan: true } });
  requireFeature(ws.plan, "metrics");

  const from = new Date(`${q.from}T00:00:00.000Z`);
  const to = new Date(new Date(`${q.to}T00:00:00.000Z`).getTime() + DAY);
  if (to <= from) throw invalid("invalid_period", "The end of the period is before its start");
  if (to.getTime() - from.getTime() > 732 * DAY) throw invalid("period_too_long", "Choose a period of at most two years");

  const pipeline = await db.pipeline.findFirst({ where: { workspaceId, ...(q.pipelineId ? { id: q.pipelineId } : { isDefault: true }) }, include: { stages: { orderBy: { order: "asc" } } } });
  if (!pipeline) throw notFound("pipeline");
  const stageById = new Map(pipeline.stages.map((s) => [s.id, s]));
  const inPeriod = { gte: from, lt: to };

  const [stageEvents, open, wonRows, lostRows, created, activities, declinedPeople] = await Promise.all([
    db.dealStageEvent.findMany({ where: { workspaceId, pipelineId: pipeline.id, at: inPeriod }, select: { dealId: true, toStageId: true, at: true } }),
    db.deal.findMany({ where: { workspaceId, pipelineId: pipeline.id, node: { archivedAt: null }, stage: { isWon: false, isLost: false } }, select: { nodeId: true, amount: true, currency: true, probability: true, stageId: true, expectedCloseDate: true } }),
    db.deal.findMany({ where: { workspaceId, pipelineId: pipeline.id, wonAt: inPeriod }, select: { amount: true, currency: true, source: true, ownerId: true, wonAt: true, node: { select: { createdAt: true } } } }),
    db.deal.findMany({ where: { workspaceId, pipelineId: pipeline.id, lostAt: inPeriod }, select: { amount: true, currency: true, source: true, lostAt: true, lostReason: { select: { name: true } }, node: { select: { createdAt: true } } } }),
    db.deal.findMany({ where: { workspaceId, pipelineId: pipeline.id, node: { createdAt: inPeriod } }, select: { source: true, amount: true, currency: true, stage: { select: { isWon: true } } } }),
    db.crmActivity.findMany({ where: { workspaceId, completedAt: inPeriod }, select: { ownerId: true, type: true } }),
    // People who said no in the period (and are still at that stage), with the reason given.
    db.contact.findMany({ where: { workspaceId, stage: "DECLINED", stageChangedAt: inPeriod, node: { archivedAt: null } }, select: { declineReason: true } }),
  ]);

  const openDeals: OpenDeal[] = open.map((d) => ({ id: d.nodeId, amount: toNum(d.amount), currency: d.currency, probability: d.probability ?? stageById.get(d.stageId)?.probability ?? 0, expectedCloseDate: d.expectedCloseDate }));
  const closed: ClosedDeal[] = [
    ...wonRows.map((d) => ({ amount: toNum(d.amount), currency: d.currency, outcome: "won" as const, lostReason: null, createdAt: d.node.createdAt, closedAt: d.wonAt as Date, source: d.source })),
    ...lostRows.map((d) => ({ amount: toNum(d.amount), currency: d.currency, outcome: "lost" as const, lostReason: d.lostReason?.name ?? null, createdAt: d.node.createdAt, closedAt: d.lostAt as Date, source: d.source })),
  ];

  const ownerIds = [...new Set([...activities.map((a) => a.ownerId), ...wonRows.map((d) => d.ownerId).filter((x): x is string => !!x)])];
  const users = ownerIds.length ? await db.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true } }) : [];
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email]));

  return {
    pipeline: { id: pipeline.id, name: pipeline.name },
    from: q.from,
    to: q.to,
    funnel: funnel(pipeline.stages, stageEvents),
    forecast: forecast(openDeals),
    winLoss: winLoss(closed),
    declines: declineStats(declinedPeople),
    sources: bySource(created.map((d) => ({ source: d.source, won: d.stage.isWon, amount: toNum(d.amount), currency: d.currency }))),
    managers: managerActivity(
      activities.map((a) => ({ ownerId: a.ownerId, type: a.type })),
      wonRows.map((d) => ({ ownerId: d.ownerId, amount: toNum(d.amount), currency: d.currency })),
    ).map((m) => ({ ...m, name: nameOf.get(m.ownerId) ?? m.ownerId })),
  };
}

const money = (m: Record<string, number>) => Object.entries(m).map(([c, v]) => `${v} ${c}`).join("; ");

export function crmReportCsv(r: Awaited<ReturnType<typeof crmReport>>, section: (typeof SECTIONS)[number]): string {
  switch (section) {
    case "funnel":
      return toCsv(["Stage", "Reached", "Conversion from previous"], r.funnel.rows.map((x) => [x.name, x.reached, x.conversion === null ? "" : `${Math.round(x.conversion * 100)}%`]));
    case "forecast":
      return toCsv(["Currency", "Month", "Deals", "Total", "Weighted"], Object.entries(r.forecast).flatMap(([cur, rows]) => rows.map((x) => [cur, x.month === "none" ? "no close date" : x.month, x.count, x.total, x.weighted])));
    case "winloss":
      return toCsv(["Metric", "Value"], [["Won", r.winLoss.won], ["Lost", r.winLoss.lost], ["Win rate", r.winLoss.winRate === null ? "" : `${Math.round(r.winLoss.winRate * 100)}%`], ["Won amount", money(r.winLoss.wonAmount)], ["Lost amount", money(r.winLoss.lostAmount)], ["Average sales cycle (days)", r.winLoss.avgCycleDays ?? ""], ["Median sales cycle (days)", r.winLoss.medianCycleDays ?? ""], ...r.winLoss.reasons.map((x) => [`Lost: ${x.reason}`, x.count]), ...r.declines.reasons.map((x) => [`Declined: ${x.reason ?? "not specified"}`, x.count])]);
    case "sources":
      return toCsv(["Source", "Deals", "Won", "Conversion", "Won amount"], r.sources.map((x) => [x.source, x.deals, x.won, `${Math.round(x.conversion * 100)}%`, money(x.wonAmount)]));
    case "managers":
      return toCsv(["Manager", "Calls", "E-mails", "Meetings", "Notes", "Tasks done", "Deals won", "Won amount"], r.managers.map((x) => [x.name, x.calls, x.emails, x.meetings, x.notes, x.tasksDone, x.dealsWon, money(x.wonAmount)]));
  }
}
