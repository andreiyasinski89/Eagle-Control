import type { Health, Node, Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { ApiError, conflict, limitReached, notFound } from "@/server/http/errors";
import { checkLimit } from "@/modules/plans";
import { canNest, isCounting, isCrmType, whyCannotMove } from "@/modules/nodes/node-rules";
import { childrenIndex } from "@/modules/nodes/progress";
import { between, evenPositions, needsRebalance } from "@/modules/nodes/position";
import {
  BUILT_IN_TEMPLATES,
  flattenTemplate,
  scheduleNode,
  templateNodeSchema,
  type BuiltInTemplateKey,
  type TemplateNode,
} from "@/modules/nodes/templates";
import {
  dataSchemaFor,
  type CreateNodeInput,
  type MoveNodeInput,
  type PatchNodeInput,
} from "@/modules/nodes/schemas";
import { loadNode, loadWorkspaceMember, logActivity, type Tx } from "./access";
import { recordStatusChanges, type StatusChange } from "./events";
import { nodePath } from "../links";
import { notify } from "../notify";
import { publishTree } from "@/server/realtime";
import { emitProjectsChanged } from "@/server/webhooks";
import { recomputeProject, type Change } from "./recompute";

export interface OpContext {
  tx: Tx;
  userId: string;
  /** Projects whose progress/health must be recomputed before the transaction commits. */
  touched: Set<string>;
  /** EVENT nodes created, changed, archived or restored: pushed to connected calendars after commit. */
  events: Set<string>;
}

/** Hands changed events to the calendar sync without making the caller wait for, or fail because of, Google. */
function pushCalendarEvents(nodeIds: string[]): void {
  void import("@/server/jobs").then((m) => m.enqueue("calendar/push", { nodeIds })).catch((e) => console.error("calendar push not queued", e instanceof Error ? e.message : e));
}

/** Runs `fn` in one transaction, then recomputes every touched project. */
export async function transact<T>(
  userId: string,
  fn: (ctx: OpContext) => Promise<T>,
): Promise<{ result: T; changes: Change[] }> {
  let touched: string[] = [];
  let events: string[] = [];
  const out = await db.$transaction(
    async (tx) => {
      const ctx: OpContext = { tx, userId, touched: new Set(), events: new Set() };
      const result = await fn(ctx);
      const changes: Change[] = [];
      for (const projectId of ctx.touched) changes.push(...(await recomputeProject(tx, projectId)));
      touched = [...ctx.touched];
      events = [...ctx.events];
      return { result, changes };
    },
    { timeout: 30_000 },
  );
  publishTree(touched, userId); // after commit: receivers re-read what is now stored
  void emitProjectsChanged(touched);
  if (events.length > 0) pushCalendarEvents(events);
  return out;
}

const invalid = (code: string, message: string, details?: Record<string, unknown>) =>
  new ApiError(422, code, message, details);

/** CRM nodes (company / contact / deal) have their own services; the project-tree operations refuse them. */
function assertProjectNode(node: Pick<Node, "type">): void {
  if (isCrmType(node.type)) throw invalid("use_crm_endpoint", "Use the CRM endpoints to change companies, contacts and deals");
}

async function assertAssignee(tx: Tx, workspaceId: string, assigneeId: string | null | undefined): Promise<void> {
  if (!assigneeId) return;
  const m = await tx.membership.findUnique({ where: { userId_workspaceId: { userId: assigneeId, workspaceId } } });
  if (!m || m.role === "CLIENT") throw invalid("invalid_assignee", "Assignee must be a member of the workspace");
}

function assertDates(start: Date | null, due: Date | null): void {
  if (start && due && start > due) throw invalid("invalid_dates", "Start date must not be after the due date");
}

const toDate = (v: string | null | undefined): Date | null | undefined =>
  v === undefined ? undefined : v === null ? null : new Date(v);

/** Position for a node placed relative to a sibling; rebalances siblings when floats run out. */
async function positionFor(
  tx: Tx,
  parentId: string,
  where: { afterId?: string | null; beforeId?: string | null },
  excludeId?: string,
): Promise<number> {
  const sibs = await tx.node.findMany({
    where: { parentId, archivedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });
  let idx = sibs.length;
  if (where.afterId) {
    const i = sibs.findIndex((s) => s.id === where.afterId);
    if (i >= 0) idx = i + 1;
  } else if (where.beforeId) {
    const i = sibs.findIndex((s) => s.id === where.beforeId);
    if (i >= 0) idx = i;
  }
  const prev = sibs[idx - 1]?.position ?? null;
  const next = sibs[idx]?.position ?? null;
  if (!needsRebalance(prev, next)) return between(prev, next);

  const even = evenPositions(sibs.length + 1);
  let j = 0;
  for (let k = 0; k < sibs.length + 1; k++) {
    if (k === idx) continue;
    const sib = sibs[j++];
    if (sib) await tx.node.update({ where: { id: sib.id }, data: { position: even[k] } });
  }
  return even[idx] ?? between(prev, next);
}

export async function createNode(ctx: OpContext, input: CreateNodeInput): Promise<Node> {
  const { tx, userId } = ctx;
  if (input.parentId === null) throw invalid("use_projects_endpoint", "Projects are created via the projects endpoint");

  const parent = await loadNode(tx, userId, input.parentId, "node:write");
  if (parent.node.archivedAt) throw conflict("parent_archived", "The parent is archived");
  if (!canNest(parent.node.type, input.type)) {
    throw invalid("invalid_nesting", `A ${input.type} cannot be placed under a ${parent.node.type}`, {
      parentType: parent.node.type,
      type: input.type,
    });
  }
  await assertAssignee(tx, parent.node.workspaceId, input.assigneeId);
  const start = toDate(input.startDate) ?? null;
  const due = toDate(input.dueDate) ?? null;
  assertDates(start, due);

  const data = dataSchemaFor(input.type).parse(input.data ?? {}) as Prisma.InputJsonValue;
  const position = await positionFor(tx, parent.node.id, { afterId: input.afterId });

  const node = await tx.node.create({
    data: {
      workspaceId: parent.node.workspaceId,
      parentId: parent.node.id,
      rootId: parent.projectId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? "TODO",
      startDate: start,
      dueDate: due,
      estimation: input.estimation ?? null,
      assigneeId: input.assigneeId ?? null,
      createdById: userId,
      position,
      data,
    },
  });
  await recordStatusChanges(tx, [{ nodeId: node.id, projectId: parent.projectId, type: node.type, from: null, to: node.status }], userId);
  if (node.assigneeId && node.assigneeId !== userId) {
    await notify({ userId: node.assigneeId, workspaceId: node.workspaceId, kind: "assigned", title: `You were assigned “${node.title}”`, url: nodePath(node), payload: { nodeId: node.id } }, tx);
  }
  await logActivity(tx, {
    workspaceId: node.workspaceId,
    nodeId: node.id,
    actorId: userId,
    action: "node.created",
    diff: { type: node.type, title: node.title, parentId: node.parentId },
  });
  ctx.touched.add(parent.projectId);
  if (node.type === "EVENT") ctx.events.add(node.id);
  return node;
}

export async function patchNode(ctx: OpContext, nodeId: string, patch: PatchNodeInput): Promise<Node> {
  const { tx, userId } = ctx;
  const { node, projectId } = await loadNode(tx, userId, nodeId, "node:write");
  assertProjectNode(node);
  if (node.archivedAt) throw conflict("archived", "The node is archived");

  const update: Prisma.NodeUncheckedUpdateInput = {};
  const diff: Record<string, [unknown, unknown]> = {};
  const set = <K extends keyof Node>(key: K, value: Node[K], dbValue?: unknown) => {
    if (JSON.stringify(node[key]) === JSON.stringify(value)) return;
    (update as Record<string, unknown>)[key as string] = dbValue ?? value;
    diff[key as string] = [node[key], value];
  };

  if (patch.title !== undefined) set("title", patch.title);
  if (patch.description !== undefined) set("description", patch.description);
  if (patch.status !== undefined) set("status", patch.status);
  if (patch.progressMode !== undefined) set("progressMode", patch.progressMode);
  if (patch.estimationUnit !== undefined) set("estimationUnit", patch.estimationUnit);
  if (patch.estimation !== undefined) set("estimation", patch.estimation as never, patch.estimation);
  if (patch.visibleToClient !== undefined) set("visibleToClient", patch.visibleToClient);
  if (patch.collapsed !== undefined) set("collapsed", patch.collapsed);

  if (patch.assigneeId !== undefined) {
    await assertAssignee(tx, node.workspaceId, patch.assigneeId);
    set("assigneeId", patch.assigneeId);
  }

  const start = patch.startDate !== undefined ? toDate(patch.startDate) ?? null : node.startDate;
  const due = patch.dueDate !== undefined ? toDate(patch.dueDate) ?? null : node.dueDate;
  assertDates(start, due);
  if (patch.startDate !== undefined) set("startDate", start, start);
  if (patch.dueDate !== undefined) set("dueDate", due, due);

  if (patch.data !== undefined) {
    const parsed = dataSchemaFor(node.type).parse(patch.data) as Prisma.InputJsonValue;
    set("data", parsed as Node["data"], parsed);
  }

  // Progress: derived nodes cannot be typed in by hand; DONE implies 100 on leaves.
  const kids = await tx.node.findMany({
    where: { parentId: node.id, archivedAt: null, status: { not: "CANCELLED" } },
    select: { type: true },
  });
  const derived = kids.some((k) => isCounting(k.type)) && !(node.type === "TASK" && (patch.progressMode ?? node.progressMode) === "MANUAL");
  if (patch.progress !== undefined) {
    if (derived) throw conflict("progress_derived", "Progress is calculated from child nodes");
    set("progress", patch.progress);
  } else if (patch.status === "DONE" && !derived) {
    set("progress", 100);
  }

  if (Object.keys(update).length === 0) return node;
  const updated = await tx.node.update({ where: { id: node.id }, data: update });
  if (updated.assigneeId && updated.assigneeId !== node.assigneeId && updated.assigneeId !== userId) {
    await notify({ userId: updated.assigneeId, workspaceId: node.workspaceId, kind: "assigned", title: `You were assigned “${updated.title}”`, url: nodePath(updated), payload: { nodeId: node.id } }, tx);
  }
  if (updated.status !== node.status) await recordStatusChanges(tx, [{ nodeId: node.id, projectId, type: node.type, from: node.status, to: updated.status }], userId);

  const loggable = Object.keys(diff).filter((k) => k !== "collapsed");
  if (loggable.length > 0) {
    await logActivity(tx, {
      workspaceId: node.workspaceId,
      nodeId: node.id,
      actorId: userId,
      action: "node.updated",
      diff: Object.fromEntries(loggable.map((k) => [k, diff[k]])) as Prisma.InputJsonValue,
    });
  }
  ctx.touched.add(projectId);
  if (updated.type === "EVENT") ctx.events.add(updated.id);
  return updated;
}

async function ancestorChain(tx: Tx, startId: string): Promise<string[]> {
  const chain: string[] = [];
  let cur: string | null = startId;
  while (cur && !chain.includes(cur) && chain.length < 64) {
    chain.push(cur);
    const row: { parentId: string | null } | null = await tx.node.findUnique({
      where: { id: cur },
      select: { parentId: true },
    });
    cur = row?.parentId ?? null;
  }
  return chain;
}

export async function moveNode(ctx: OpContext, nodeId: string, input: MoveNodeInput): Promise<Node> {
  const { tx, userId } = ctx;
  const { node, projectId } = await loadNode(tx, userId, nodeId, "node:write");
  assertProjectNode(node);
  if (node.archivedAt) throw conflict("archived", "The node is archived");
  if (input.parentId === null) throw invalid("invalid_move", "Only projects are roots", { reason: "root_only_project" });

  const target = await loadNode(tx, userId, input.parentId, "node:write");
  const chain = await ancestorChain(tx, target.node.id);
  const reason = whyCannotMove(node, target.node, chain, projectId === target.projectId);
  if (reason) throw invalid("invalid_move", `Cannot move: ${reason}`, { reason });
  if (target.node.archivedAt) throw conflict("parent_archived", "The target is archived");

  const position = await positionFor(tx, target.node.id, { afterId: input.afterId, beforeId: input.beforeId }, node.id);
  const moved = await tx.node.update({ where: { id: node.id }, data: { parentId: target.node.id, position } });
  await logActivity(tx, {
    workspaceId: node.workspaceId,
    nodeId: node.id,
    actorId: userId,
    action: "node.moved",
    diff: { parentId: [node.parentId, target.node.id] },
  });
  ctx.touched.add(projectId);
  return moved;
}

async function subtreeIds(tx: Tx, projectId: string, rootId: string, archived: boolean): Promise<string[]> {
  const rows = await tx.node.findMany({
    where: { OR: [{ id: projectId }, { rootId: projectId }], archivedAt: archived ? { not: null } : null },
    select: { id: true, parentId: true },
  });
  const byParent = childrenIndex(rows);
  const out: string[] = [];
  const walk = (id: string) => {
    out.push(id);
    (byParent.get(id) ?? []).forEach((c) => walk(c.id));
  };
  walk(rootId);
  return out;
}

export async function archiveNode(ctx: OpContext, nodeId: string): Promise<{ archivedAt: Date; ids: string[] }> {
  const { tx, userId } = ctx;
  const { node, projectId } = await loadNode(tx, userId, nodeId, "node:write");
  assertProjectNode(node);
  if (node.archivedAt) throw conflict("archived", "Already archived");
  const ids = await subtreeIds(tx, projectId, node.id, false);
  const archivedAt = new Date();
  await tx.node.updateMany({ where: { id: { in: ids } }, data: { archivedAt } });
  await logActivity(tx, {
    workspaceId: node.workspaceId,
    nodeId: node.id,
    actorId: userId,
    action: "node.archived",
    diff: { count: ids.length },
  });
  ctx.touched.add(projectId);
  for (const e of await tx.node.findMany({ where: { id: { in: ids }, type: "EVENT" }, select: { id: true } })) ctx.events.add(e.id);
  return { archivedAt, ids };
}

export async function restoreNode(ctx: OpContext, nodeId: string): Promise<{ ids: string[] }> {
  const { tx, userId } = ctx;
  const { node, projectId } = await loadNode(tx, userId, nodeId, "node:write");
  assertProjectNode(node);
  if (!node.archivedAt) throw conflict("not_archived", "Not archived");
  if (node.parentId) {
    const parent = await tx.node.findUnique({ where: { id: node.parentId }, select: { archivedAt: true } });
    if (parent?.archivedAt) throw conflict("parent_archived", "Restore the parent first");
  }
  // Only what was archived together with this node (same timestamp) comes back.
  const archivedTogether = await tx.node.findMany({
    where: { OR: [{ id: projectId }, { rootId: projectId }], archivedAt: node.archivedAt },
    select: { id: true, parentId: true },
  });
  const byParent = childrenIndex(archivedTogether);
  const ids: string[] = [];
  const walk = (id: string) => {
    ids.push(id);
    (byParent.get(id) ?? []).forEach((c) => walk(c.id));
  };
  walk(node.id);
  await tx.node.updateMany({ where: { id: { in: ids } }, data: { archivedAt: null } });
  await logActivity(tx, {
    workspaceId: node.workspaceId,
    nodeId: node.id,
    actorId: userId,
    action: "node.restored",
    diff: { count: ids.length },
  });
  ctx.touched.add(projectId);
  for (const e of await tx.node.findMany({ where: { id: { in: ids }, type: "EVENT" }, select: { id: true } })) ctx.events.add(e.id);
  return { ids };
}

export async function completeNode(ctx: OpContext, nodeId: string): Promise<Node> {
  const { tx, userId } = ctx;
  const { node, projectId } = await loadNode(tx, userId, nodeId, "node:write");
  assertProjectNode(node);
  if (node.archivedAt) throw conflict("archived", "The node is archived");
  const ids = (await subtreeIds(tx, projectId, node.id, false)).filter((id) => id !== node.id);
  const toRecord: StatusChange[] = [{ nodeId: node.id, projectId, type: node.type, from: node.status, to: "DONE" }];
  if (ids.length > 0) {
    const kids = await tx.node.findMany({ where: { id: { in: ids } }, select: { id: true, type: true, status: true } });
    const counting = kids.filter((k) => isCounting(k.type)).map((k) => k.id);
    for (const k of kids) if (isCounting(k.type)) toRecord.push({ nodeId: k.id, projectId, type: k.type, from: k.status, to: "DONE" });
    await tx.node.updateMany({ where: { id: { in: counting } }, data: { status: "DONE", progress: 100 } });
  }
  const done = await tx.node.update({ where: { id: node.id }, data: { status: "DONE", progress: 100 } });
  await recordStatusChanges(tx, toRecord, userId);
  await logActivity(tx, { workspaceId: node.workspaceId, nodeId: node.id, actorId: userId, action: "node.completed" });
  ctx.touched.add(projectId);
  return done;
}

export async function setHealthOverride(
  ctx: OpContext,
  nodeId: string,
  value: { health: Health; note: string } | null,
): Promise<Node> {
  const { tx, userId } = ctx;
  const { node, projectId } = await loadNode(tx, userId, nodeId, "node:write");
  assertProjectNode(node);
  const updated = await tx.node.update({
    where: { id: node.id },
    data: { healthOverride: value?.health ?? null, healthOverrideNote: value?.note ?? null },
  });
  await logActivity(tx, {
    workspaceId: node.workspaceId,
    nodeId: node.id,
    actorId: userId,
    action: value ? "node.health_override" : "node.health_override_cleared",
    diff: value ? { health: value.health, note: value.note } : undefined,
  });
  ctx.touched.add(projectId);
  return updated;
}

export async function createLink(
  ctx: OpContext,
  input: { fromNodeId: string; toNodeId: string; kind: "BLOCKS" | "RELATES" | "ATTACHED" },
) {
  const { tx, userId } = ctx;
  if (input.fromNodeId === input.toNodeId) throw invalid("invalid_link", "A node cannot link to itself");
  const from = await loadNode(tx, userId, input.fromNodeId, "node:write");
  const to = await loadNode(tx, userId, input.toNodeId, "node:write");
  assertProjectNode(from.node);
  assertProjectNode(to.node);
  if (from.node.workspaceId !== to.node.workspaceId) throw invalid("invalid_link", "Nodes are in different workspaces");
  const existing = await tx.nodeLink.findUnique({
    where: { fromNodeId_toNodeId_kind: { fromNodeId: from.node.id, toNodeId: to.node.id, kind: input.kind } },
  });
  if (existing) throw conflict("link_exists", "These nodes are already linked");
  const link = await tx.nodeLink.create({ data: { fromNodeId: from.node.id, toNodeId: to.node.id, kind: input.kind } });
  await logActivity(tx, {
    workspaceId: from.node.workspaceId,
    nodeId: from.node.id,
    actorId: userId,
    action: "link.created",
    diff: { kind: input.kind, to: to.node.id },
  });
  ctx.touched.add(from.projectId);
  ctx.touched.add(to.projectId);
  return link;
}

export async function deleteLink(ctx: OpContext, linkId: string): Promise<void> {
  const { tx, userId } = ctx;
  const link = await tx.nodeLink.findUnique({ where: { id: linkId } });
  if (!link) throw notFound("link");
  const from = await loadNode(tx, userId, link.fromNodeId, "node:write");
  const to = await loadNode(tx, userId, link.toNodeId, "node:write");
  await tx.nodeLink.delete({ where: { id: linkId } });
  ctx.touched.add(from.projectId);
  ctx.touched.add(to.projectId);
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  /** Built-in template key. */
  template?: BuiltInTemplateKey;
  /** A workspace-defined template (wins over `template`). */
  templateId?: string;
  /** A tree built by the caller (wins over both): used by the first 30 days of a partner. */
  structure?: TemplateNode;
  estimationUnit?: "HOURS" | "STORY_POINTS";
  /** Set when the project grows out of a won deal. */
  dealId?: string;
  companyId?: string;
}

interface ResolvedTemplate {
  key: string;
  structure: TemplateNode | null;
  defaultDurationDays: number;
}

export const workspaceTemplateSchema = z.object({ defaultDurationDays: z.number().int().min(1).max(3650).default(60), root: templateNodeSchema });

async function resolveTemplate(tx: Tx, workspaceId: string, input: CreateProjectInput): Promise<ResolvedTemplate> {
  if (input.structure) return { key: "custom", structure: input.structure, defaultDurationDays: 30 };
  if (input.templateId) {
    const row = await tx.projectTemplate.findFirst({ where: { id: input.templateId, OR: [{ workspaceId }, { workspaceId: null }] } });
    if (!row) throw notFound("template");
    const parsed = workspaceTemplateSchema.safeParse(row.structure);
    if (!parsed.success) throw invalid("invalid_template", "This template is damaged");
    return { key: row.id, structure: parsed.data.root, defaultDurationDays: parsed.data.defaultDurationDays };
  }
  const key = input.template ?? "empty";
  const def = BUILT_IN_TEMPLATES[key];
  return { key, structure: def.structure, defaultDurationDays: def.defaultDurationDays };
}

/** Creates the project (and its template tree) inside an open transaction. */
export async function createProjectIn(ctx: OpContext, workspaceId: string, input: CreateProjectInput): Promise<Node> {
  const { tx, userId } = ctx;
  await loadWorkspaceMember(tx, userId, workspaceId, "project:create");
  const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { plan: true } });
  const count = await tx.node.count({ where: { workspaceId, type: "PROJECT", archivedAt: null } });
  const check = checkLimit(workspace.plan, "projects", count);
  if (!check.allowed) throw limitReached(check.limit, "projects");

  const tpl = await resolveTemplate(tx, workspaceId, input);
  const start = toDate(input.startDate) ?? null;
  let due = toDate(input.dueDate) ?? null;
  if (start && !due && tpl.structure) due = new Date(start.getTime() + tpl.defaultDurationDays * 86_400_000);
  assertDates(start, due);
  const flat = tpl.structure ? flattenTemplate(tpl.structure, input.name) : [];

  const project = await tx.node.create({
    data: {
      workspaceId,
      type: "PROJECT",
      title: input.name,
      description: input.description ?? null,
      startDate: start,
      dueDate: due,
      createdById: userId,
      position: Date.now(),
      data: {
        estimationUnit: input.estimationUnit ?? "HOURS",
        templateId: tpl.key,
        ...(input.dealId ? { dealId: input.dealId } : {}),
        ...(input.companyId ? { companyId: input.companyId } : {}),
      } as Prisma.InputJsonValue,
    },
  });

  const ids = new Map<number, string>();
  const siblingCounter = new Map<number, number>();
  const created_: StatusChange[] = [{ nodeId: project.id, projectId: project.id, type: "PROJECT", from: null, to: project.status }];
  for (const f of flat) {
    if (f.parentKey === null) {
      ids.set(f.key, project.id);
      continue;
    }
    const n = (siblingCounter.get(f.parentKey) ?? 0) + 1;
    siblingCounter.set(f.parentKey, n);
    const window = start ? scheduleNode(f, start) : null;
    const created = await tx.node.create({
      data: {
        workspaceId,
        parentId: ids.get(f.parentKey) ?? project.id,
        rootId: project.id,
        type: f.type,
        title: f.title,
        estimation: f.estimation,
        startDate: window?.start ?? null,
        dueDate: window?.due ?? null,
        createdById: userId,
        position: n * 1024,
        data: {},
      },
    });
    ids.set(f.key, created.id);
    created_.push({ nodeId: created.id, projectId: project.id, type: created.type, from: null, to: created.status });
  }
  await recordStatusChanges(tx, created_, userId);

  await logActivity(tx, {
    workspaceId,
    nodeId: project.id,
    actorId: userId,
    action: "node.created",
    diff: { type: "PROJECT", title: project.title, template: tpl.key, ...(input.dealId ? { dealId: input.dealId } : {}) },
  });
  ctx.touched.add(project.id);
  return project;
}

export async function createProject(
  userId: string,
  workspaceId: string,
  input: CreateProjectInput,
): Promise<{ project: Node; changes: Change[] }> {
  const { result, changes } = await transact(userId, (ctx) => createProjectIn(ctx, workspaceId, input));
  return { project: result, changes };
}
