import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { forbidden } from "@/server/http/errors";
import { can } from "@/server/policies";
import { cleanRanks, cleanState, emptyState, evaluateRank, MAX_CRITERIA, MAX_RANKS, type AutoValues } from "@/modules/crm/ranks";
import { isValidTimeZone, todayIn } from "@/modules/views/tz";
import { loadWorkspaceMember, logActivity } from "@/server/services/nodes/access";
import { invalid } from "./common";
import { contactScope, withScope } from "./scope";

const criterion = z.object({ id: z.string().max(40).optional(), label: z.string().trim().min(1).max(80), target: z.number().int().min(1).max(1_000_000), auto: z.enum(["clients", "partnersFirstLine", "teamSize", "invitesMonth"]).nullable() });
export const rankPlanSchema = z.object({ ranks: z.array(z.object({ id: z.string().max(40).optional(), name: z.string().trim().min(1).max(60), criteria: z.array(criterion).max(MAX_CRITERIA) })).max(MAX_RANKS) });
export const rankStateSchema = z.object({
  currentRankId: z.string().max(40).nullable().optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /** Values of the criteria the person types by hand, by criterion id. */
  manual: z.record(z.string().max(40), z.number().int().min(0).max(1_000_000)).optional(),
});

/** What the platform counts for the person from the team tree and their clients. Without their own partner card the team numbers are zero. */
async function autoValues(userId: string, workspaceId: string, member: Awaited<ReturnType<typeof loadWorkspaceMember>>, monthStart: Date): Promise<AutoValues> {
  const scope = await contactScope(db, member);
  const rows = await db.contact.findMany({
    where: withScope({ workspaceId, node: { archivedAt: null }, OR: [{ stage: "PARTNER" }, { sponsorId: { not: null } }, { stage: "CLIENT" }] }, scope),
    select: { nodeId: true, stage: true, sponsorId: true, linkedUserId: true, ownerId: true, stageChangedAt: true },
  });
  const by = new Map(rows.map((r) => [r.nodeId, r]));
  const partners = rows.filter((r) => r.stage === "PARTNER");
  const ids = new Set(partners.map((p) => p.nodeId));
  const selfId = partners.find((p) => p.linkedUserId === userId && p.ownerId === userId)?.nodeId ?? null;
  const parentOf = (id: string): string | null => {
    const seen = new Set([id]);
    let up = by.get(id)?.sponsorId ?? null;
    while (up && !seen.has(up)) {
      if (ids.has(up)) return up;
      seen.add(up);
      up = by.get(up)?.sponsorId ?? null;
    }
    return null;
  };
  const parent = new Map(partners.filter((p) => p.nodeId !== selfId).map((p) => [p.nodeId, parentOf(p.nodeId)]));
  const first = partners.filter((p) => selfId && parent.get(p.nodeId) === selfId);
  const below = (id: string, seen = new Set<string>()): number => {
    let n = 0;
    for (const [k, v] of parent) {
      if (v !== id || seen.has(k)) continue;
      seen.add(k);
      n += 1 + below(k, seen);
    }
    return n;
  };
  return {
    clients: rows.filter((r) => r.stage === "CLIENT" && r.ownerId === userId).length,
    partnersFirstLine: first.length,
    teamSize: selfId ? below(selfId) : 0,
    invitesMonth: first.filter((p) => p.stageChangedAt >= monthStart).length,
  };
}

/** The ladder of ranks the workspace uses, the person's place on it, and what is left to reach the next rank. */
export async function getRankTracker(userId: string, workspaceId: string, now = new Date()) {
  const member = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const [w, me] = await Promise.all([db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { rankPlan: true } }), db.user.findUnique({ where: { id: userId }, select: { timezone: true } })]);
  const tz = me && isValidTimeZone(me.timezone) ? me.timezone : "UTC";
  const today = todayIn(tz, now);
  const ranks = cleanRanks(w.rankPlan);
  const state = member.rankState ? cleanState(member.rankState) : emptyState();
  const crm = can(member, "crm:read");
  const auto = ranks.length && crm ? await autoValues(userId, workspaceId, member, new Date(`${today.slice(0, 7)}-01T00:00:00Z`)) : { clients: 0, partnersFirstLine: 0, teamSize: 0, invitesMonth: 0 };
  return { ranks, state, status: evaluateRank(ranks, state, auto, today), auto, today, canChange: can(member, "workspace:update") };
}

/** Owners and admins write the ladder. Values typed by hand stay with their criterion while its id stays. */
export async function saveRankPlan(userId: string, workspaceId: string, input: z.infer<typeof rankPlanSchema>) {
  const member = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  if (!can(member, "workspace:update")) throw forbidden();
  const ranks = cleanRanks(input.ranks);
  await db.$transaction(async (tx) => {
    await tx.workspace.update({ where: { id: workspaceId }, data: { rankPlan: ranks.length ? (ranks as unknown as Prisma.InputJsonValue) : Prisma.DbNull } });
    await logActivity(tx, { workspaceId, nodeId: null, actorId: userId, action: "workspace.rank_plan", diff: { ranks: ranks.length } });
  });
  return getRankTracker(userId, workspaceId);
}

/** The person's own place: which rank they hold, the day they aim for, and the values of the criteria they count by hand (each stamped with today). */
export async function saveRankState(userId: string, workspaceId: string, input: z.infer<typeof rankStateSchema>, now = new Date()) {
  const member = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const w = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { rankPlan: true } });
  const ranks = cleanRanks(w.rankPlan);
  if (input.currentRankId && !ranks.some((r) => r.id === input.currentRankId)) throw invalid("invalid_rank", "This rank is not in the list");
  const state = member.rankState ? cleanState(member.rankState) : emptyState();
  if (input.currentRankId !== undefined) state.currentRankId = input.currentRankId;
  if (input.targetDate !== undefined) state.targetDate = input.targetDate;
  const known = new Set(ranks.flatMap((r) => r.criteria.filter((c) => !c.auto).map((c) => c.id)));
  for (const [id, value] of Object.entries(input.manual ?? {})) {
    if (!known.has(id)) throw invalid("invalid_criterion", "This criterion is not counted by hand");
    state.manual[id] = { value, at: now.toISOString() };
  }
  await db.membership.update({ where: { userId_workspaceId: { userId, workspaceId } }, data: { rankState: state as unknown as Prisma.InputJsonValue } });
  return getRankTracker(userId, workspaceId, now);
}
