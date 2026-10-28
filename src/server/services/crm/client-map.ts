import type { Health, NodeStatus, NodeType, ProgressMode } from "@prisma/client";
import { db } from "@/server/db";
import { dealHealth, effectiveProbability, stageStatus } from "@/modules/crm/deal-rules";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { contactScope, withScope } from "./scope";
import { blockedIds, evaluate } from "@/server/services/nodes/recompute";
import { fullName, loadCrmNode, NO_TOUCH_DAYS, STALE_DAYS, STUCK_DAYS, toNum } from "./common";

export interface CrmExtras {
  kind: "company" | "contact" | "deal";
  lifecycleStage?: string;
  website?: string | null;
  revenue?: Record<string, number>;
  /** Company: some linked project is red. */
  atRisk?: boolean;
  position?: string | null;
  email?: string | null;
  lastContactedAt?: Date | null;
  noTouch?: boolean;
  amount?: number;
  currency?: string;
  stage?: string;
  probability?: number;
  dealStatus?: string;
  nextStep?: string | null;
}

/** Same shape the project map uses, plus CRM extras and a flag for edges that are links rather than parenthood. */
export interface MapNode {
  id: string;
  parentId: string | null;
  type: NodeType;
  title: string;
  status: NodeStatus;
  progress: number;
  progressMode: ProgressMode;
  health: Health;
  healthOverride: Health | null;
  position: number;
  startDate: Date | null;
  dueDate: Date | null;
  estimation: number | null;
  assigneeId: string | null;
  collapsed: boolean;
  visibleToClient: boolean;
  tagIds: string[];
  blocked: boolean;
  /** The edge to the parent is a DEAL_PROJECT link (the project does not depend on the CRM tree). */
  linked?: boolean;
  crm?: CrmExtras;
}

const RANK: Record<Health, number> = { GREEN: 0, YELLOW: 1, RED: 2 };
const worst = (hs: Health[]): Health => hs.reduce<Health>((w, h) => (RANK[h] > RANK[w] ? h : w), "GREEN");

/**
 * Client Map: company → contacts and deals → (via links) the projects that grew out of those deals →
 * epics → sprints → tasks. Health is computed for today; a red project marks the company as at risk.
 */
export async function getClientMap(userId: string, companyId: string, today = new Date()) {
  const company = await loadCrmNode(db, userId, companyId, "COMPANY");
  const membership = await loadWorkspaceMember(db, userId, company.workspaceId, "crm:full");
  const co = await db.company.findUniqueOrThrow({ where: { nodeId: companyId } });

  const [contacts, deals] = await Promise.all([
    db.contact.findMany({ where: withScope({ companyId, node: { archivedAt: null } }, await contactScope(db, membership)), include: { node: { select: { title: true, position: true, collapsed: true } } } }),
    db.deal.findMany({ where: { companyId, node: { archivedAt: null } }, include: { stage: true, node: { select: { title: true, position: true } } } }),
  ]);
  const links = deals.length ? await db.nodeLink.findMany({ where: { kind: "DEAL_PROJECT", fromNodeId: { in: deals.map((d) => d.nodeId) }, to: { archivedAt: null, type: "PROJECT" } }, select: { fromNodeId: true, toNodeId: true } }) : [];
  const projectIds = [...new Set(links.map((l) => l.toNodeId))];
  const dealOfProject = new Map(links.map((l) => [l.toNodeId, l.fromNodeId]));

  const rowsRaw = projectIds.length
    ? await db.node.findMany({
        where: { archivedAt: null, OR: [{ id: { in: projectIds } }, { rootId: { in: projectIds } }] },
        select: { id: true, parentId: true, type: true, title: true, status: true, progress: true, progressMode: true, estimation: true, startDate: true, dueDate: true, assigneeId: true, healthOverride: true, health: true, position: true, collapsed: true, visibleToClient: true },
      })
    : [];
  const rows = rowsRaw.map((r) => ({ ...r, estimation: r.estimation === null ? null : Number(r.estimation) }));
  const blocked = await blockedIds(db, rows.map((r) => r.id));
  const computed = evaluate(rows, blocked, today);
  const tagRows = rows.length ? await db.nodeTag.findMany({ where: { nodeId: { in: rows.map((r) => r.id) } }, select: { nodeId: true, tagId: true } }) : [];
  const tags = new Map<string, string[]>();
  for (const t of tagRows) tags.set(t.nodeId, [...(tags.get(t.nodeId) ?? []), t.tagId]);

  const projectNodes: MapNode[] = rows.map((r) => {
    const c = computed.get(r.id);
    const isRoot = projectIds.includes(r.id);
    return {
      id: r.id,
      parentId: isRoot ? (dealOfProject.get(r.id) ?? null) : r.parentId,
      type: r.type,
      title: r.title,
      status: r.status,
      progress: c?.progress ?? r.progress,
      progressMode: r.progressMode,
      health: c?.health ?? "GREEN",
      healthOverride: r.healthOverride,
      position: r.position,
      startDate: r.startDate,
      dueDate: r.dueDate,
      estimation: r.estimation,
      assigneeId: r.assigneeId,
      collapsed: r.collapsed,
      visibleToClient: r.visibleToClient,
      tagIds: tags.get(r.id) ?? [],
      blocked: blocked.has(r.id),
      linked: isRoot,
    };
  });

  const projectHealths = projectIds.map((id) => computed.get(id)?.health ?? "GREEN");
  const atRisk = projectHealths.includes("RED");
  const revenue: Record<string, number> = {};
  const dealCards = deals.map((d) => {
    const status = stageStatus(d.stage);
    if (status === "won") revenue[d.currency] = (revenue[d.currency] ?? 0) + toNum(d.amount);
    return { d, status, health: dealHealth({ status, lastActivityAt: d.lastActivityAt, stageEnteredAt: d.stageEnteredAt, nextStep: d.nextStep, nextStepAt: d.nextStepAt, expectedCloseDate: d.expectedCloseDate }, today, { staleDays: STALE_DAYS, stuckDays: STUCK_DAYS }) };
  });
  const noTouchBefore = today.getTime() - NO_TOUCH_DAYS * 86_400_000;

  const base = { status: "TODO" as NodeStatus, progress: 0, progressMode: "MANUAL" as ProgressMode, healthOverride: null, startDate: null, dueDate: null, estimation: null, assigneeId: null, visibleToClient: false, tagIds: [] as string[], blocked: false };

  const nodes: MapNode[] = [
    {
      ...base,
      id: company.id,
      parentId: null,
      type: "COMPANY",
      title: co.legalName,
      health: worst([...projectHealths, ...dealCards.map((x) => x.health)]),
      position: 0,
      collapsed: company.collapsed,
      crm: { kind: "company", lifecycleStage: co.lifecycleStage, website: co.website, revenue, atRisk },
    },
    ...contacts.map<MapNode>((c) => ({
      ...base,
      id: c.nodeId,
      parentId: companyId,
      type: "CONTACT",
      title: fullName(c.firstName, c.lastName),
      health: "GREEN",
      position: c.node.position,
      collapsed: false,
      crm: { kind: "contact", position: c.position, email: c.emails[0] ?? null, lastContactedAt: c.lastContactedAt, noTouch: !c.lastContactedAt || c.lastContactedAt.getTime() < noTouchBefore },
    })),
    ...dealCards.map<MapNode>(({ d, status, health }) => ({
      ...base,
      id: d.nodeId,
      parentId: companyId,
      type: "DEAL",
      title: d.node.title,
      health,
      position: d.node.position,
      collapsed: false,
      crm: { kind: "deal", amount: toNum(d.amount), currency: d.currency, stage: d.stage.name, probability: effectiveProbability(d.stage, d.probability), dealStatus: status, nextStep: d.nextStep },
    })),
    ...projectNodes,
  ];

  const assigned = new Set(nodes.map((n) => n.assigneeId).filter((x): x is string => x !== null));
  const people = await db.user.findMany({ where: { OR: [{ memberships: { some: { workspaceId: company.workspaceId } } }, { id: { in: [...assigned] } }] }, select: { id: true, name: true, email: true, avatar: true, image: true } });

  return {
    kind: "client" as const,
    project: { id: company.id, workspaceId: company.workspaceId, title: co.legalName, data: {} },
    nodes,
    people,
    role: membership.role,
    meId: userId,
    atRisk,
    serverTime: today.toISOString(),
  };
}
