import type { Plan } from "@prisma/client";
import { db } from "@/server/db";
import { activeSources, daysLeft, effectivePlan, trialEnd, TRIAL_DAYS } from "@/modules/plans/entitlement";
import { isGrantedEmail } from "./grants";
import { notify } from "./notify";
import { isEnforcedFor, paidMode, previewEmails } from "./paid-plans";

const DAY = 86_400_000;

const sourcesOf = (w: { basePlan: Plan; trialEndsAt: Date | null; bonusUntil: Date | null; giftUntil: Date | null }) => ({ basePlan: w.basePlan, trialEndsAt: w.trialEndsAt, bonusUntil: w.bonusUntil, giftUntil: w.giftUntil });

async function tellOwners(workspaceId: string, title: string, body: string, key: string): Promise<void> {
  const owners = await db.membership.findMany({ where: { workspaceId, role: "OWNER" }, select: { userId: true } });
  for (const o of owners) await notify({ userId: o.userId, workspaceId, kind: "billing", title, body, url: "/settings/billing", dedupeKey: key }).catch(() => undefined);
}

/**
 * Puts `plan` (the one everything reads) right: the lasting plan, or Pro while a trial, a bonus or a gift is running.
 * Call it after anything that changes a source, and daily so that ended sources fall away.
 */
export async function syncPlan(workspaceId: string, now = new Date()): Promise<{ before: Plan; after: Plan }> {
  const w = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { plan: true, basePlan: true, trialEndsAt: true, bonusUntil: true, giftUntil: true } });
  // While paid plans are not in force for this workspace it has everything (Pro); the lasting plan and the time-limited ones wait underneath.
  const after = effectivePlan(sourcesOf(w), now, !(await isEnforcedFor(workspaceId)));
  if (after !== w.plan) await db.workspace.update({ where: { id: workspaceId }, data: { plan: after } });
  return { before: w.plan, after };
}

/**
 * Starts the 14-day Pro trial of a new workspace: once per workspace, and once per person (the first workspace they own), never for a
 * workspace that already has a paid plan. Returns whether it started.
 */
export async function startTrial(userId: string, workspaceId: string, now = new Date()): Promise<boolean> {
  if (!(await isEnforcedFor(workspaceId))) return false; // no trial while everything is free
  const w = await db.workspace.findUnique({ where: { id: workspaceId }, select: { basePlan: true, trialEndsAt: true, memberships: { where: { userId, role: "OWNER" }, select: { userId: true } } } });
  if (!w || w.memberships.length === 0 || w.basePlan !== "FREE" || w.trialEndsAt) return false;
  const me = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (me && isGrantedEmail(me.email)) return false;
  const had = await db.workspace.count({ where: { id: { not: workspaceId }, trialEndsAt: { not: null }, memberships: { some: { userId, role: "OWNER" } } } });
  if (had > 0) return false;
  await db.workspace.update({ where: { id: workspaceId }, data: { trialEndsAt: trialEnd(now) } });
  await syncPlan(workspaceId, now);
  await tellOwners(workspaceId, `Your ${TRIAL_DAYS} days of Pro have started`, "Everything in Pro is on. Nothing is deleted when the trial ends.", `trial:start:${workspaceId}`);
  return true;
}

/** What the billing page and the banner need to say about where the workspace's Pro comes from. */
export async function entitlementOf(workspaceId: string, now = new Date()) {
  const w = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { plan: true, basePlan: true, trialEndsAt: true, bonusUntil: true, giftUntil: true } });
  const s = sourcesOf(w);
  const sources = activeSources(s, now);
  const enforced = await isEnforcedFor(workspaceId);
  return {
    enforced,
    plan: w.plan,
    basePlan: w.basePlan,
    sources: sources.map((x) => ({ source: x.source, until: x.until, daysLeft: daysLeft(x.until, now) })),
    /** Pro only because of the trial, with this many days left. */
    trialDaysLeft: enforced && w.basePlan === "FREE" && sources.length === 1 && sources[0]?.source === "trial" ? daysLeft(w.trialEndsAt, now) : null,
    trialEnded: enforced && w.basePlan === "FREE" && !!w.trialEndsAt && w.trialEndsAt.getTime() <= now.getTime(),
  };
}

/**
 * Daily: workspaces whose trial, bonus or gift has run out go back to what they lasting have (the owners are told, nothing is deleted),
 * and those whose trial ends within three days get one reminder.
 */
export async function expireTimed(now = new Date()): Promise<{ ended: number; reminded: number }> {
  const rows = await db.workspace.findMany({ where: { OR: [{ trialEndsAt: { not: null } }, { bonusUntil: { not: null } }, { giftUntil: { not: null } }] }, select: { id: true, plan: true, basePlan: true, trialEndsAt: true, bonusUntil: true, giftUntil: true } });
  let ended = 0;
  let reminded = 0;
  for (const w of rows) {
    const r = await syncPlan(w.id, now);
    if (r.before !== r.after && r.after === "FREE") {
      ended++;
      await tellOwners(w.id, "Your Pro has ended: the workspace is on the Free plan", "Nothing was deleted. Limits apply to new items again; pick a plan to get Pro back.", `pro:ended:${w.id}:${now.toISOString().slice(0, 10)}`);
    }
    if (w.basePlan === "FREE" && w.trialEndsAt && w.trialEndsAt.getTime() > now.getTime() && w.trialEndsAt.getTime() - now.getTime() <= 3 * DAY) {
      reminded++;
      await tellOwners(w.id, "Your Pro trial ends in 3 days or less", "Pick a plan in Settings → Billing to keep Pro; otherwise the workspace goes to Free and nothing is deleted.", `trial:remind:${w.id}`);
    }
  }
  return { ended, reminded };
}

/**
 * Puts the plan of every workspace right after the switch (or a list of preview addresses) has changed, and as a daily safety net.
 * Returns how many workspaces changed; the owner uses the same call from the admin after changing the switch.
 */
export async function recomputePlans(now = new Date()): Promise<{ checked: number; changed: number; mode: ReturnType<typeof paidMode> }> {
  const mode = paidMode();
  const rows = await db.workspace.findMany({ select: { id: true } });
  let changed = 0;
  for (const w of rows) {
    const r = await syncPlan(w.id, now);
    if (r.before !== r.after) changed++;
  }
  return { checked: rows.length, changed, mode };
}

export { paidMode, previewEmails };
