import type { Health, Node, NodeStatus, NodeType, ProgressMode } from "@prisma/client";
import { db } from "@/server/db";
import { notFound } from "@/server/http/errors";
import { can } from "@/server/policies";
import { buildBurndown } from "@/modules/nodes/burndown";
import { childrenIndex } from "@/modules/nodes/progress";
import { isCounting } from "@/modules/nodes/node-rules";
import { loadNode, loadWorkspaceMember, projectIdOf } from "./access";
import { blockedIds, evaluate, loadProjectRows } from "./recompute";

export interface TreeNodeDto {
  id: string;
  parentId: string | null;
  type: NodeType;
  title: string;
  status: NodeStatus;
  progress: number;
  health: Health;
  healthOverride: Health | null;
  progressMode: ProgressMode;
  position: number;
  startDate: Date | null;
  dueDate: Date | null;
  estimation: number | null;
  /** HOURS or STORY_POINTS; null follows the project's unit. */
  estimationUnit?: "HOURS" | "STORY_POINTS" | null;
  assigneeId: string | null;
  collapsed: boolean;
  visibleToClient: boolean;
  tagIds: string[];
  blocked: boolean;
  childCount: number;
}

/**
 * Whole project as a flat list. Progress and health are recomputed on read so they never go
 * stale with the calendar; the client hides collapsed branches and renders only what is visible.
 */
export async function getTree(userId: string, projectId: string, today = new Date()) {
  const { node: project, membership } = await loadNode(db, userId, projectId);
  if (project.type !== "PROJECT") throw notFound("project");

  const [full, tagRows] = await Promise.all([
    db.node.findMany({
      where: { archivedAt: null, OR: [{ id: projectId }, { rootId: projectId }] },
      select: {
        id: true,
        parentId: true,
        type: true,
        title: true,
        status: true,
        position: true,
        collapsed: true,
        visibleToClient: true,
        healthOverride: true,
        estimationUnit: true,
      },
    }),
    db.nodeTag.findMany({ where: { node: { OR: [{ id: projectId }, { rootId: projectId }] } }, select: { nodeId: true, tagId: true } }),
  ]);
  const rows = await loadProjectRows(db, projectId);
  const blocked = await blockedIds(db, rows.map((r) => r.id));
  const computed = evaluate(rows, blocked, today);

  const meta = new Map(full.map((f) => [f.id, f]));
  const tags = new Map<string, string[]>();
  for (const t of tagRows) tags.set(t.nodeId, [...(tags.get(t.nodeId) ?? []), t.tagId]);
  const kids = childrenIndex(rows);

  const nodes: TreeNodeDto[] = rows.map((r) => {
    const m = meta.get(r.id);
    const c = computed.get(r.id);
    return {
      id: r.id,
      parentId: r.parentId,
      type: r.type,
      title: m?.title ?? "",
      status: r.status,
      progress: c?.progress ?? r.progress,
      health: c?.health ?? "GREEN",
      healthOverride: r.healthOverride,
      progressMode: r.progressMode,
      position: m?.position ?? 0,
      startDate: r.startDate,
      dueDate: r.dueDate,
      estimation: r.estimation,
      estimationUnit: m?.estimationUnit ?? null,
      assigneeId: r.assigneeId,
      collapsed: m?.collapsed ?? false,
      visibleToClient: m?.visibleToClient ?? false,
      tagIds: tags.get(r.id) ?? [],
      blocked: blocked.has(r.id),
      childCount: (kids.get(r.id) ?? []).length,
    };
  });

  // People shown on cards / filters: every member for roles that may list them, else just assignees.
  const assignedIds = new Set(rows.map((r) => r.assigneeId).filter((x): x is string => x !== null));
  const people = await db.user.findMany({
    where: can(membership, "member:list")
      ? { memberships: { some: { workspaceId: project.workspaceId } } }
      : { id: { in: [...assignedIds] } },
    select: { id: true, name: true, email: true, avatar: true, image: true },
  });
  return {
    project: { id: project.id, workspaceId: project.workspaceId, title: project.title, data: project.data },
    nodes,
    people,
    role: membership.role,
    meId: userId,
    serverTime: today.toISOString(),
  };
}

export async function getNodeDetail(userId: string, nodeId: string, today = new Date()) {
  const { node, projectId } = await loadNode(db, userId, nodeId);

  const [rows, tagRows, assignee, linksFrom, linksTo, attachments, parentChain] = await Promise.all([
    loadProjectRows(db, projectId),
    db.nodeTag.findMany({ where: { nodeId }, select: { tag: { select: { id: true, name: true, color: true } } } }),
    node.assigneeId
      ? db.user.findUnique({ where: { id: node.assigneeId }, select: { id: true, name: true, email: true, avatar: true, image: true } })
      : Promise.resolve(null),
    db.nodeLink.findMany({ where: { fromNodeId: nodeId }, include: { to: { select: { id: true, title: true, type: true, status: true } } } }),
    db.nodeLink.findMany({ where: { toNodeId: nodeId }, include: { from: { select: { id: true, title: true, type: true, status: true } } } }),
    db.attachment.findMany({ where: { nodeId }, orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { id: true, name: true } } } }),
    breadcrumb(node),
  ]);

  const blocked = await blockedIds(db, rows.map((r) => r.id));
  const computed = evaluate(rows, blocked, today).get(node.id);

  // Per-status summary and burndown for containers.
  const byParent = childrenIndex(rows);
  const descendants: typeof rows = [];
  const walk = (id: string) =>
    (byParent.get(id) ?? []).forEach((c) => {
      descendants.push(c);
      walk(c.id);
    });
  walk(node.id);
  const tasks = descendants.filter((d) => d.type === "TASK" && d.status !== "CANCELLED");
  const statusSummary: Partial<Record<NodeStatus, number>> = {};
  for (const t of tasks) statusSummary[t.status] = (statusSummary[t.status] ?? 0) + 1;

  let burndown = null;
  if ((node.type === "SPRINT" || node.type === "EPIC") && node.startDate && node.dueDate && tasks.length > 0) {
    const doneIds = tasks.filter((t) => t.status === "DONE").map((t) => t.id);
    const logs = doneIds.length
      ? await db.activityLog.findMany({
          where: { nodeId: { in: doneIds }, action: { in: ["node.completed", "node.updated"] } },
          orderBy: { createdAt: "asc" },
          select: { nodeId: true, action: true, diff: true, createdAt: true },
        })
      : [];
    const doneAt = new Map<string, Date>();
    for (const l of logs) {
      const diff = l.diff as { status?: [unknown, unknown] } | null;
      if (l.action === "node.completed" || diff?.status?.[1] === "DONE") doneAt.set(l.nodeId ?? "", l.createdAt);
    }
    burndown = buildBurndown(
      tasks.map((t) => ({ weight: t.estimation && t.estimation > 0 ? t.estimation : 1, doneAt: doneAt.get(t.id) ?? (t.status === "DONE" ? node.startDate : null) })),
      node.startDate,
      node.dueDate,
      today,
    );
  }

  return {
    node: { ...node, estimation: node.estimation === null ? null : Number(node.estimation), progress: computed?.progress ?? node.progress, health: computed?.health ?? node.health },
    blocked: blocked.has(node.id),
    tags: tagRows.map((t) => t.tag),
    assignee,
    links: [
      ...linksFrom.map((l) => ({ id: l.id, kind: l.kind, direction: "out" as const, other: l.to })),
      ...linksTo.map((l) => ({ id: l.id, kind: l.kind, direction: "in" as const, other: l.from })),
    ],
    attachments: attachments.map((a) => ({ id: a.id, fileName: a.fileName, mime: a.mime, size: a.size, visibleToClient: a.visibleToClient, createdAt: a.createdAt, uploadedBy: a.uploadedBy })),
    breadcrumb: parentChain,
    statusSummary,
    taskCount: tasks.length,
    burndown,
  };
}

async function breadcrumb(node: Node): Promise<{ id: string; title: string; type: NodeType }[]> {
  const chain: { id: string; title: string; type: NodeType }[] = [];
  let cur = node.parentId;
  while (cur && chain.length < 32) {
    const p: { id: string; title: string; type: NodeType; parentId: string | null } | null = await db.node.findUnique({
      where: { id: cur },
      select: { id: true, title: true, type: true, parentId: true },
    });
    if (!p) break;
    chain.unshift({ id: p.id, title: p.title, type: p.type });
    cur = p.parentId;
  }
  return chain;
}

export async function listProjects(userId: string, workspaceId: string) {
  const membership = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const restricted = membership.role === "GUEST" || membership.role === "CLIENT";
  const projects = await db.node.findMany({
    where: {
      workspaceId,
      type: "PROJECT",
      archivedAt: null,
      ...(restricted ? { projectAccess: { some: { userId } } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, description: true, progress: true, health: true, startDate: true, dueDate: true, createdAt: true },
  });
  return projects;
}

export async function searchNodes(userId: string, workspaceId: string, q: string, projectId?: string) {
  const membership = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const restricted = membership.role === "GUEST" || membership.role === "CLIENT";
  let reachable: string[] | undefined;
  if (restricted) {
    const pms = await db.projectMember.findMany({ where: { userId }, select: { nodeId: true } });
    reachable = pms.map((p) => p.nodeId);
  }
  const term = q.trim();
  if (!term) return [];
  const nodes = await db.node.findMany({
    where: {
      workspaceId,
      archivedAt: null,
      type: { in: ["PROJECT", "EPIC", "SPRINT", "TASK", "SUBTASK", "DOCUMENT", "EVENT"] },
      title: { contains: term, mode: "insensitive" },
      ...(projectId ? { OR: [{ id: projectId }, { rootId: projectId }] } : {}),
      ...(reachable ? { AND: [{ OR: [{ id: { in: reachable } }, { rootId: { in: reachable } }] }] } : {}),
    },
    take: 20,
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, type: true, rootId: true, status: true },
  });
  return nodes.map((n) => ({ id: n.id, title: n.title, type: n.type, status: n.status, projectId: projectIdOf(n) }));
}

export async function listActivity(userId: string, nodeId: string) {
  const { node } = await loadNode(db, userId, nodeId);
  const logs = await db.activityLog.findMany({
    where: { nodeId: node.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const actors = await db.user.findMany({
    where: { id: { in: [...new Set(logs.map((l) => l.actorId).filter((x): x is string => x !== null))] } },
    select: { id: true, name: true, email: true },
  });
  const byId = new Map(actors.map((a) => [a.id, a]));
  return logs.map((l) => ({ id: l.id, action: l.action, diff: l.diff, createdAt: l.createdAt, actor: l.actorId ? (byId.get(l.actorId) ?? null) : null }));
}

export { isCounting };
