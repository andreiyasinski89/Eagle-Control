import { z } from "zod";
import { db } from "@/server/db";
import { cleanGoals, emptyCounts, METRICS, METRIC_STAGE, stepDate, weekBounds, type Counts, type Goals } from "@/modules/crm/tracker";
import { isValidTimeZone, todayIn } from "@/modules/views/tz";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { fullName, invalid, loadCrmNode } from "./common";
import { contactScope, withScope } from "./scope";

export const weekSchema = z.object({ week: z.coerce.number().int().min(-52).max(0).default(0) });
export const goalsSchema = z.object({ goals: z.record(z.enum(METRICS), z.number().int().min(0).max(9999)) });
export const stepDoneSchema = z.object({
  /** In how many days the next step falls; leave out to close the step without a new one. */
  afterDays: z.number().int().min(0).max(365).optional(),
  /** What the next step is; the old text is kept when only the date is given. */
  nextStep: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
});

async function zoneOf(userId: string): Promise<string> {
  const me = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return me && isValidTimeZone(me.timezone) ? me.timezone : "UTC";
}

/**
 * The week of one person's work, counted from what happened: people added, reached, presentations, clients and partners (each a move into that stage),
 * calls and meetings held. Next to it the week's targets, and what each partner's people did, for the team summary.
 */
export async function getWeek(userId: string, workspaceId: string, f: z.infer<typeof weekSchema>, now = new Date()) {
  const member = await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const scope = await contactScope(db, member);
  const tz = await zoneOf(userId);
  const w = weekBounds(tz, now, f.week);
  const range = { gte: w.start, lt: w.end };
  const [mine, meetings, goalRow, teamEvents] = await Promise.all([
    db.contactStageEvent.findMany({ where: { workspaceId, actorId: userId, at: range }, select: { fromStage: true, toStage: true } }),
    db.crmActivity.count({ where: { workspaceId, ownerId: userId, type: { in: ["CALL", "MEETING"] }, completedAt: range } }),
    db.networkGoal.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } }),
    db.contactStageEvent.findMany({ where: { workspaceId, at: range, contact: withScope({ heldById: { not: null } }, scope) }, select: { toStage: true, contact: { select: { heldById: true } } } }),
  ]);

  const counts: Counts = emptyCounts();
  counts.meetings = meetings;
  for (const e of mine) {
    if (e.fromStage === null) counts.added++;
    for (const [m, stage] of Object.entries(METRIC_STAGE)) if (e.toStage === stage) counts[m as keyof Counts]++;
  }

  const byPartner = new Map<string, Counts>();
  for (const e of teamEvents) {
    const id = e.contact.heldById as string;
    const c = byPartner.get(id) ?? emptyCounts();
    for (const [m, stage] of Object.entries(METRIC_STAGE)) if (e.toStage === stage) c[m as keyof Counts]++;
    byPartner.set(id, c);
  }
  const partners = await db.contact.findMany({ where: withScope({ nodeId: { in: [...byPartner.keys()] } }, scope), select: { nodeId: true, firstName: true, lastName: true } });
  const team = partners.map((p) => ({ id: p.nodeId, name: fullName(p.firstName, p.lastName), ...(byPartner.get(p.nodeId) as Counts) })).sort((a, b) => b.presentations + b.clients + b.partners - (a.presentations + a.clients + a.partners) || a.name.localeCompare(b.name));

  return { week: f.week, from: w.from, to: w.to, counts, goals: cleanGoals(goalRow?.goals), team };
}

export async function saveGoals(userId: string, workspaceId: string, input: z.infer<typeof goalsSchema>) {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const goals: Goals = cleanGoals(input.goals);
  await db.networkGoal.upsert({ where: { workspaceId_userId: { workspaceId, userId } }, create: { workspaceId, userId, goals }, update: { goals } });
  return { goals };
}

/**
 * Closes a person's next step: a completed note says what was done, the contact counts as touched now, and the next step moves on
 * (a new date, and a new text if given) or is cleared. One call from the plan of the day.
 */
export async function completeStep(userId: string, contactId: string, input: z.infer<typeof stepDoneSchema>, now = new Date()) {
  const tz = await zoneOf(userId);
  return db.$transaction(async (tx) => {
    const node = await loadCrmNode(tx, userId, contactId, "CONTACT", true);
    const c = await tx.contact.findUniqueOrThrow({ where: { nodeId: contactId } });
    if (input.nextStep && input.afterDays === undefined) throw invalid("missing_date", "Say in how many days the next step falls");
    await tx.crmActivity.create({ data: { workspaceId: node.workspaceId, type: "NOTE", subject: c.nextStep ? `Done: ${c.nextStep}` : "Step done", body: input.note || null, ownerId: userId, contactId, completedAt: now } });
    const next = input.afterDays === undefined ? { nextStep: null, nextStepAt: null } : { nextStep: input.nextStep || c.nextStep, nextStepAt: new Date(stepDate(todayIn(tz, now), input.afterDays)) };
    await tx.contact.update({ where: { nodeId: contactId }, data: { lastContactedAt: now, ...next } });
    return { nextStep: next.nextStep, nextStepAt: next.nextStepAt };
  });
}
