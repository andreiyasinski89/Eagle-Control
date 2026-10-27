import { z } from "zod";
import { db } from "@/server/db";
import { STAGES } from "@/modules/crm/people";
import { stepDate } from "@/modules/crm/tracker";
import { isValidTimeZone, todayIn } from "@/modules/views/tz";
import { loadWorkspaceMember, logActivity, type Tx } from "@/server/services/nodes/access";

export const saveRulesSchema = z.object({
  rules: z
    .array(z.object({ stage: z.enum(STAGES), nextStep: z.string().trim().max(200), afterDays: z.number().int().min(0).max(365) }))
    .max(STAGES.length)
    .refine((r) => new Set(r.map((x) => x.stage)).size === r.length, "One rule for each stage"),
});

export async function listRules(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  return { rules: (await db.stageRule.findMany({ where: { workspaceId } })).map((r) => ({ stage: r.stage, nextStep: r.nextStep, afterDays: r.afterDays })) };
}

/** Replaces the workspace's rules with the given ones; a rule with no text is dropped. */
export async function saveRules(userId: string, workspaceId: string, input: z.infer<typeof saveRulesSchema>) {
  return db.$transaction(async (tx) => {
    await loadWorkspaceMember(tx, userId, workspaceId, "crm:write");
    const keep = input.rules.filter((r) => r.nextStep.length > 0);
    await tx.stageRule.deleteMany({ where: { workspaceId } });
    if (keep.length) await tx.stageRule.createMany({ data: keep.map((r) => ({ workspaceId, stage: r.stage, nextStep: r.nextStep, afterDays: r.afterDays })) });
    await logActivity(tx, { workspaceId, nodeId: null, actorId: userId, action: "stage_rules.saved", diff: { rules: keep.length } });
    return { rules: keep };
  });
}

/** The next step a person gets on moving into `stage`, when the workspace has a rule for it. The date counts from today in the actor's time zone. */
export async function autoPlan(tx: Tx, userId: string, workspaceId: string, stage: (typeof STAGES)[number], now = new Date()): Promise<{ nextStep: string; nextStepAt: Date } | null> {
  const rule = await tx.stageRule.findUnique({ where: { workspaceId_stage: { workspaceId, stage } } });
  if (!rule) return null;
  const me = await tx.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  const tz = me && isValidTimeZone(me.timezone) ? me.timezone : "UTC";
  return { nextStep: rule.nextStep, nextStepAt: new Date(stepDate(todayIn(tz, now), rule.afterDays)) };
}
