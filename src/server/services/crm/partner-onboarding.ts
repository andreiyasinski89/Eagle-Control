import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { forbidden } from "@/server/http/errors";
import { can } from "@/server/policies";
import { cleanSteps, defaultSteps, MAX_STEPS, PLAN_TITLE, planToTemplate, progressOf, type OnboardingProgress, type OnboardingStep, type PlanLocale } from "@/modules/crm/onboarding-plan";
import { loadWorkspaceMember, logActivity } from "@/server/services/nodes/access";
import { createProjectIn, transact } from "@/server/services/nodes/ops";
import { fullName, invalid } from "./common";
import { contactVisible } from "./scope";

const localeSchema = z.enum(["ru", "en", "pl", "uk"]);
export const planSchema = z.object({
  steps: z.array(z.object({ title: z.string().trim().min(1).max(120), day: z.number().int().min(0).max(29), days: z.number().int().min(1).max(30), checkpoint: z.boolean() })).min(1).max(MAX_STEPS),
});
export const planBodySchema = z.object({ steps: planSchema.shape.steps.nullable(), locale: localeSchema.optional() });
export const startOnboardingSchema = z.object({ locale: localeSchema.optional() });
export const planQuerySchema = z.object({ locale: localeSchema.default("ru") });

/** The steps a workspace uses for a new partner (its own, or the default plan) and whether the asker may change them. */
export async function getOnboardingPlan(userId: string, workspaceId: string, locale: PlanLocale = "ru") {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const w = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { onboardingPlan: true } });
  const own = cleanSteps(w.onboardingPlan);
  return { steps: own ?? defaultSteps(locale), custom: !!own, canChange: can(m, "workspace:update") };
}

/** Owners and admins write the plan; `null` steps go back to the default plan. Projects already started keep what they were made with. */
export async function saveOnboardingPlan(userId: string, workspaceId: string, steps: OnboardingStep[] | null, locale: PlanLocale = "ru") {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  if (!can(m, "workspace:update")) throw forbidden();
  await db.$transaction(async (tx) => {
    await tx.workspace.update({ where: { id: workspaceId }, data: { onboardingPlan: steps ? (steps as unknown as Prisma.InputJsonValue) : Prisma.DbNull } });
    await logActivity(tx, { workspaceId, nodeId: null, actorId: userId, action: "workspace.onboarding_plan", diff: { steps: steps?.length ?? 0 } });
  });
  return getOnboardingPlan(userId, workspaceId, locale);
}

/** Progress of the first 30 days of each partner given, from the tasks that belong to the newcomer; partners with no such project are left out. */
export async function onboardingProgress(workspaceId: string, partners: { id: string; linkedUserId: string | null }[]): Promise<Map<string, OnboardingProgress>> {
  const out = new Map<string, OnboardingProgress>();
  if (!partners.length) return out;
  const projects = await db.node.findMany({ where: { workspaceId, type: "PROJECT", archivedAt: null, OR: partners.map((p) => ({ data: { path: ["onboardingFor"], equals: p.id } })) }, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true, data: true } });
  const byContact = new Map<string, (typeof projects)[number]>();
  for (const pr of projects) {
    const c = (pr.data as { onboardingFor?: string }).onboardingFor;
    if (c && !byContact.has(c)) byContact.set(c, pr);
  }
  const tasks = byContact.size ? await db.node.findMany({ where: { rootId: { in: [...byContact.values()].map((p) => p.id) }, type: "TASK", archivedAt: null }, select: { rootId: true, title: true, status: true, position: true, assigneeId: true } }) : [];
  for (const p of partners) {
    const pr = byContact.get(p.id);
    if (!pr) continue;
    out.set(p.id, progressOf(pr.id, pr.createdAt, tasks.filter((t) => t.rootId === pr.id && (!p.linkedUserId || t.assigneeId === p.linkedUserId))));
  }
  return out;
}

export async function getPartnerOnboarding(userId: string, workspaceId: string, contactId: string) {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  if (!(await contactVisible(db, m, contactId))) return { progress: null as OnboardingProgress | null };
  const c = await db.contact.findFirst({ where: { nodeId: contactId, workspaceId }, select: { nodeId: true, linkedUserId: true } });
  if (!c) return { progress: null };
  return { progress: (await onboardingProgress(workspaceId, [{ id: c.nodeId, linkedUserId: c.linkedUserId }])).get(contactId) ?? null };
}

/**
 * Starts the first 30 days for a partner who has an account: one project, a task for each step assigned to the newcomer, and for the steps with a
 * checkpoint one more task assigned to whoever starts it (the mentor). Starting it twice gives back the project that is already there.
 */
export async function startOnboarding(userId: string, workspaceId: string, contactId: string, locale: PlanLocale = "ru") {
  const member = await loadWorkspaceMember(db, userId, workspaceId, "crm:write");
  if (!(await contactVisible(db, member, contactId, { write: true }))) throw invalid("invalid_partner", "Partner not found in this workspace");
  const c = await db.contact.findFirst({ where: { nodeId: contactId, workspaceId, node: { archivedAt: null } }, select: { nodeId: true, stage: true, firstName: true, lastName: true, linkedUserId: true } });
  if (!c || c.stage !== "PARTNER") throw invalid("not_partner", "This person is not in the Partner stage");
  if (!c.linkedUserId) throw invalid("no_account", "The partner has no account yet: invite them to the platform first");
  if (c.linkedUserId === userId) throw invalid("own_card", "You cannot start the first 30 days for yourself");
  const have = (await onboardingProgress(workspaceId, [{ id: c.nodeId, linkedUserId: c.linkedUserId }])).get(contactId);
  if (have) return { projectId: have.projectId, created: false };

  const plan = await getOnboardingPlan(userId, workspaceId, locale);
  const { root, tasks } = planToTemplate(plan.steps, locale);
  const start = new Date().toISOString().slice(0, 10);
  const due = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const name = `${PLAN_TITLE[locale]}: ${fullName(c.firstName, c.lastName)}`;
  const { result } = await transact(userId, async (ctx) => {
    const project = await createProjectIn(ctx, workspaceId, { name, startDate: start, dueDate: due, structure: root });
    await ctx.tx.node.update({ where: { id: project.id }, data: { data: { ...(project.data as Record<string, unknown>), onboardingFor: contactId } as Prisma.InputJsonValue } });
    // The tasks were made in the order of the plan, one position after another: hand each to its person.
    const made = await ctx.tx.node.findMany({ where: { rootId: project.id, type: "TASK" }, orderBy: { position: "asc" }, select: { id: true } });
    for (const [i, n] of made.entries()) await ctx.tx.node.update({ where: { id: n.id }, data: { assigneeId: tasks[i]?.who === "mentor" ? userId : c.linkedUserId } });
    await logActivity(ctx.tx, { workspaceId, nodeId: project.id, actorId: userId, action: "partner.onboarding_started", diff: { partner: contactId, tasks: made.length } });
    return project;
  });
  return { projectId: result.id, created: true };
}

/** What the person themself has to do in the first 30 days somebody started for them (across the workspace), for their home page. */
export async function getMyOnboarding(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const mine = await db.contact.findMany({ where: { workspaceId, linkedUserId: userId, stage: "PARTNER", node: { archivedAt: null } }, select: { nodeId: true, linkedUserId: true } });
  const all = await onboardingProgress(workspaceId, mine.map((m) => ({ id: m.nodeId, linkedUserId: m.linkedUserId })));
  return { progress: [...all.values()].find((p) => !p.finished) ?? [...all.values()][0] ?? null };
}
