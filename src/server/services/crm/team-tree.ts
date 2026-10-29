import { z } from "zod";
import { db } from "@/server/db";
import { forbidden } from "@/server/http/errors";
import { can } from "@/server/policies";
import { latest } from "@/modules/crm/team-activity";
import { cleanHeat, DEFAULT_DEPTH, heatOf, MAX_DEPTH, sliceTree, type Heat, type HeatSettings } from "@/modules/crm/team-tree";
import { loadWorkspaceMember, logActivity } from "@/server/services/nodes/access";
import type { OnboardingProgress } from "@/modules/crm/onboarding-plan";
import { onboardingProgress } from "./partner-onboarding";
import { fullName } from "./common";
import { contactScope, withScope } from "./scope";

/** One answer never carries more partners than this; deeper lines are opened by a click, branch by branch. */
export const TEAM_TREE_LIMIT = 400;

export const teamTreeSchema = z.object({
  /** The partner whose line to open; absent starts from the person's own card. */
  root: z.string().min(1).optional(),
  depth: z.coerce.number().int().min(1).max(MAX_DEPTH).default(DEFAULT_DEPTH),
});
export const teamHeatSchema = z.object({ greenDays: z.number().int().min(1).max(60), yellowDays: z.number().int().min(2).max(90), newcomerDays: z.number().int().min(1).max(90) });

export interface TeamTreeNode {
  id: string;
  parentId: string | null;
  level: number;
  name: string;
  city: string | null;
  country: string | null;
  /** The day the person became a partner. */
  since: Date;
  hasAccount: boolean;
  heat: Heat;
  lastAt: Date | null;
  /** Calls, messages and e-mails finished in the last 7 days, and meetings held, among the people this partner works with. */
  touches7: number;
  meetings7: number;
  /** Partners who came through this one directly, and everyone in their line. */
  invited: number;
  team: number;
  /** Partners hang below that the answer did not include. */
  hasMore: boolean;
  /** The first 30 days started for this partner, when there are some. */
  onboarding: OnboardingProgress | null;
  /** How to write to the partner, when the card has it: only for those the asker may see. */
  telegram: string | null;
  whatsapp: string | null;
  phone: string | null;
}

export async function getTeamHeat(userId: string, workspaceId: string) {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const w = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { teamHeat: true } });
  return { settings: cleanHeat(w.teamHeat), canChange: can(m, "workspace:update") };
}

/** Owners and admins set after how many days a partner turns yellow and red; the change is written down. */
export async function setTeamHeat(userId: string, workspaceId: string, input: z.infer<typeof teamHeatSchema>) {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  if (!can(m, "workspace:update")) throw forbidden();
  const settings = cleanHeat(input);
  await db.$transaction(async (tx) => {
    await tx.workspace.update({ where: { id: workspaceId }, data: { teamHeat: { ...settings } } });
    await logActivity(tx, { workspaceId, nodeId: null, actorId: userId, action: "workspace.team_heat", diff: { ...settings } });
  });
  return { settings, canChange: true };
}

/**
 * The partners as a tree for the "My team" map: from the person's own card (or from the partner whose line was opened) down `depth` levels.
 * Each partner carries numbers only (touches and meetings of the last 7 days, the size of the line) and a colour from their last sign of work.
 * What the person may see follows the CRM scope: in a private workspace only the partners they can see appear.
 */
export async function getTeamTree(userId: string, workspaceId: string, f: z.infer<typeof teamTreeSchema>, now = new Date()) {
  const member = await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const scope = await contactScope(db, member);
  const w = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { teamHeat: true } });
  const heat: HeatSettings = cleanHeat(w.teamHeat);

  const rows = await db.contact.findMany({
    where: withScope({ workspaceId, node: { archivedAt: null }, OR: [{ stage: "PARTNER" }, { sponsorId: { not: null } }] }, scope),
    select: { nodeId: true, firstName: true, lastName: true, stage: true, sponsorId: true, linkedUserId: true, ownerId: true, city: true, country: true, stageChangedAt: true, messengers: true, phones: true },
  });
  const by = new Map(rows.map((r) => [r.nodeId, r]));
  const partners = rows.filter((r) => r.stage === "PARTNER");
  const partnerIds = new Set(partners.map((r) => r.nodeId));
  const selfId = partners.find((p) => p.linkedUserId === userId && p.ownerId === userId)?.nodeId ?? null;
  // The nearest partner above: people who are not partners are passed over, as in the team list.
  const parentOf = (id: string): string | null => {
    const seen = new Set([id]);
    let up = by.get(id)?.sponsorId ?? null;
    while (up && !seen.has(up)) {
      if (partnerIds.has(up)) return up;
      seen.add(up);
      up = by.get(up)?.sponsorId ?? null;
    }
    return null;
  };
  const all = partners.filter((p) => p.nodeId !== selfId).map((p) => ({ id: p.nodeId, parentId: parentOf(p.nodeId) }));
  const rootId = f.root ?? selfId;
  if (f.root && !partnerIds.has(f.root)) return { rootId: null, selfId, nodes: [] as TeamTreeNode[], settings: heat, truncated: false, total: all.length };

  const slice = sliceTree(all, rootId, f.depth);
  const truncated = slice.length > TEAM_TREE_LIMIT;
  const shown = slice.slice(0, TEAM_TREE_LIMIT);
  const ids = shown.map((s) => s.node.id);

  const since7 = new Date(now.getTime() - 7 * 86_400_000);
  const [acts, held, children] = ids.length
    ? await Promise.all([
        db.crmActivity.findMany({ where: { workspaceId, completedAt: { gte: since7, lte: now }, type: { in: ["CALL", "EMAIL", "MESSAGE", "MEETING"] }, contact: { heldById: { in: ids } } }, select: { type: true, contact: { select: { heldById: true } } } }),
        db.contact.findMany({ where: { workspaceId, heldById: { in: ids }, lastContactedAt: { not: null } }, select: { heldById: true, lastContactedAt: true } }),
        db.contact.groupBy({ by: ["sponsorId"], where: { workspaceId, stage: "PARTNER", node: { archivedAt: null }, sponsorId: { in: ids } }, _count: { _all: true } }),
      ])
    : [[], [], []];
  const lastMoves = new Map<string, Date | null>();
  await Promise.all(
    ids.map(async (id) => {
      const [e, a] = await Promise.all([
        db.contactStageEvent.findFirst({ where: { workspaceId, contact: { heldById: id } }, orderBy: { at: "desc" }, select: { at: true } }),
        db.crmActivity.findFirst({ where: { workspaceId, completedAt: { not: null }, contact: { heldById: id } }, orderBy: { completedAt: "desc" }, select: { completedAt: true } }),
      ]);
      lastMoves.set(id, latest(e?.at, a?.completedAt));
    }),
  );
  const accounts = shown.map((s) => by.get(s.node.id)?.linkedUserId).filter((x): x is string => !!x);
  const logs = accounts.length ? await db.activityLog.groupBy({ by: ["actorId"], where: { workspaceId, actorId: { in: accounts } }, _max: { createdAt: true } }) : [];
  const lastLog = new Map(logs.map((l) => [l.actorId, l._max.createdAt]));
  const onboarding = await onboardingProgress(workspaceId, shown.map((s) => ({ id: s.node.id, linkedUserId: by.get(s.node.id)?.linkedUserId ?? null })));
  const invited = new Map(children.map((c) => [c.sponsorId as string, c._count._all]));
  const kids = new Map<string | null, string[]>();
  for (const a of all) kids.set(a.parentId, [...(kids.get(a.parentId) ?? []), a.id]);
  const lineSize = (id: string, seen = new Set<string>()): number => (kids.get(id) ?? []).reduce((n, k) => (seen.has(k) ? n : (seen.add(k), n + 1 + lineSize(k, seen))), 0);

  const nodes: TeamTreeNode[] = shown.map(({ node, level, hasMore }) => {
    const r = by.get(node.id)!;
    const mine = acts.filter((a) => a.contact?.heldById === node.id);
    const lastAt = latest(lastMoves.get(node.id), ...held.filter((h) => h.heldById === node.id).map((h) => h.lastContactedAt), r.linkedUserId ? lastLog.get(r.linkedUserId) : null);
    return {
      id: node.id,
      parentId: node.parentId === rootId ? (f.root ? f.root : null) : node.parentId,
      level,
      name: fullName(r.firstName, r.lastName),
      city: r.city,
      country: r.country,
      since: r.stageChangedAt,
      hasAccount: !!r.linkedUserId,
      heat: heatOf(lastAt, r.stageChangedAt, now, heat, onboarding.get(node.id) ? { startedAt: new Date(onboarding.get(node.id)!.startedAt), finished: onboarding.get(node.id)!.finished } : null),
      onboarding: onboarding.get(node.id) ?? null,
      lastAt,
      touches7: mine.filter((a) => a.type !== "MEETING").length,
      meetings7: mine.filter((a) => a.type === "MEETING").length,
      invited: invited.get(node.id) ?? 0,
      team: lineSize(node.id),
      hasMore,
      telegram: (r.messengers as Record<string, string> | null)?.telegram ?? null,
      whatsapp: (r.messengers as Record<string, string> | null)?.whatsapp ?? null,
      phone: r.phones[0] ?? null,
    };
  });
  return { rootId, selfId, nodes, settings: heat, truncated, total: all.length };
}
