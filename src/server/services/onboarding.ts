import { z } from "zod";
import { db } from "@/server/db";
import { cleanGoals } from "@/modules/crm/tracker";
import { dreamDistance, evaluate, STEPS, type Facts } from "@/modules/onboarding/steps";
import { isValidTimeZone, todayIn } from "@/modules/views/tz";
import { can } from "@/server/policies";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { contactScope, withScope } from "./crm/scope";

const STEP_IDS = STEPS.map((s) => s.id) as [string, ...string[]];

export const goalSchema = z.object({
  dream: z.string().trim().max(500),
  why: z.string().trim().max(2000),
  targetDate: z.string().date().nullable(),
  targetClients: z.number().int().min(0).max(100_000).nullable(),
  targetPartners: z.number().int().min(0).max(100_000).nullable(),
});
export const skipSchema = z.object({ step: z.enum(STEP_IDS), skipped: z.boolean() });
export const hideSchema = z.object({ hidden: z.boolean() });

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Where a person stands in getting started: the steps (done by what their data shows), the dream they wrote down and how far it is.
 * Everything is counted from the workspace's own data; only the skipped steps, the hidden list and the dream are stored.
 */
export async function getOnboarding(userId: string, workspaceId: string, now = new Date()) {
  const membership = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const crm = can(membership, "crm:read");
  const scope = crm ? await contactScope(db, membership) : null;
  const [me, state, goal] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    db.onboardingState.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } }),
    db.personalGoal.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } }),
  ]);
  const tz = me && isValidTimeZone(me.timezone) ? me.timezone : "UTC";
  const today = todayIn(tz, now);
  const live = { node: { archivedAt: null } };

  const [tasksCreated, timeEntries, notes] = await Promise.all([
    db.node.count({ where: { workspaceId, createdById: userId, type: { in: ["TASK", "SUBTASK"] }, archivedAt: null } }),
    db.timeEntry.count({ where: { workspaceId, userId } }),
    db.note.count({ where: { workspaceId, userId } }),
  ]);

  let c = { invited: 0, people: 0, peopleMoved: 0, nextSteps: 0, scripts: 0, rules: 0, weekGoals: false, stepsClosed: 0, groups: 0, partners: 0, clientsWon: 0, partnersWon: 0 };
  if (crm) {
    const [people, peopleMoved, nextSteps, scripts, rules, goals, stepsClosed, groups, partners, clientsWon, partnersWon, joined, platformInvited] = await Promise.all([
      db.contact.count({ where: withScope({ workspaceId, ...live }, scope) }),
      db.contact.count({ where: withScope({ workspaceId, ...live, stage: { not: "NEW" } }, scope) }),
      db.contact.count({ where: withScope({ workspaceId, ...live, nextStep: { not: null } }, scope) }),
      db.script.count({ where: { workspaceId } }),
      db.stageRule.count({ where: { workspaceId } }),
      db.networkGoal.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } }),
      db.crmActivity.count({ where: { workspaceId, ownerId: userId, type: "NOTE", completedAt: { not: null }, OR: [{ subject: { startsWith: "Done:" } }, { subject: "Step done" }] } }),
      db.contactGroup.count({ where: { workspaceId } }),
      db.contact.count({ where: withScope({ workspaceId, ...live, stage: "PARTNER" }, scope) }),
      db.contact.count({ where: withScope({ workspaceId, ...live, ownerId: userId, stage: "CLIENT" }, scope) }),
      db.contact.count({ where: withScope({ workspaceId, ...live, ownerId: userId, stage: "PARTNER" }, scope) }),
      db.referralJoin.count({ where: { link: { userId, workspaceId } } }),
      db.user.count({ where: { referredById: userId } }),
    ]);
    c = { invited: joined + platformInvited, people, peopleMoved, nextSteps, scripts, rules, weekGoals: Object.values(cleanGoals(goals?.goals)).some((v) => v > 0), stepsClosed, groups, partners, clientsWon, partnersWon };
  }

  const facts: Facts = { timezoneSet: me !== null && me.timezone !== "UTC", tasksCreated, timeEntries, notes, hasDream: !!goal?.dream.trim(), people: c.people, peopleMoved: c.peopleMoved, nextSteps: c.nextSteps, scripts: c.scripts, rules: c.rules, weekGoals: c.weekGoals, stepsClosed: c.stepsClosed, groups: c.groups, partners: c.partners, invited: c.invited };
  const evaluation = evaluate(facts, state?.skipped ?? [], { crm });
  const goalDto = { dream: goal?.dream ?? "", why: goal?.why ?? "", targetDate: day(goal?.targetDate ?? null), targetClients: goal?.targetClients ?? null, targetPartners: goal?.targetPartners ?? null };
  return { crm, today, hidden: state?.hidden ?? false, ...evaluation, goal: goalDto, distance: dreamDistance(goalDto, { clients: c.clientsWon, partners: c.partnersWon }, today) };
}

export async function saveGoal(userId: string, workspaceId: string, input: z.infer<typeof goalSchema>) {
  await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const data = { dream: input.dream, why: input.why, targetDate: input.targetDate ? new Date(`${input.targetDate}T00:00:00.000Z`) : null, targetClients: input.targetClients, targetPartners: input.targetPartners };
  await db.personalGoal.upsert({ where: { workspaceId_userId: { workspaceId, userId } }, create: { workspaceId, userId, ...data }, update: data });
  return { saved: true };
}

export async function setStepSkipped(userId: string, workspaceId: string, input: z.infer<typeof skipSchema>) {
  await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const cur = await db.onboardingState.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  const set = new Set(cur?.skipped ?? []);
  if (input.skipped) set.add(input.step);
  else set.delete(input.step);
  const skipped = [...set];
  await db.onboardingState.upsert({ where: { workspaceId_userId: { workspaceId, userId } }, create: { workspaceId, userId, skipped }, update: { skipped } });
  return { skipped };
}

export async function setHidden(userId: string, workspaceId: string, input: z.infer<typeof hideSchema>) {
  await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  await db.onboardingState.upsert({ where: { workspaceId_userId: { workspaceId, userId } }, create: { workspaceId, userId, hidden: input.hidden }, update: { hidden: input.hidden } });
  return { hidden: input.hidden };
}
