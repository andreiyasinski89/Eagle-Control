import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Membership, Node, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { ApiError, forbidden, notFound } from "@/server/http/errors";
import { hasFeature } from "@/modules/plans";
import { planFeatureRequired } from "@/server/services/metrics";
import { presignDownload, presignUpload } from "@/server/storage";
import { publishComment, publishTreeSoon } from "@/server/realtime";
import { safeFileName } from "./attachments";
import type { confirmSchema, presignSchema } from "./attachments";
import { loadNode, logActivity } from "./nodes/access";
import { notify } from "./notify";

/**
 * The client portal: everything a client sees or does goes through this file, and each function starts with the same
 * question: is this person a client of this project (or an owner/admin previewing it), and is this node shared with clients?
 * Anything else is "not found", never "forbidden", so ids reveal nothing.
 */

const SHAREABLE = ["EPIC", "SPRINT", "TASK", "SUBTASK", "DOCUMENT", "EVENT"] as const;

interface Access {
  userId: string;
  membership: Membership;
  project: Node;
  /** A client of the project; owners and admins previewing it can look, comment and download but not decide. */
  isClient: boolean;
}

export async function portalAccess(userId: string, projectId: string): Promise<Access> {
  const project = await db.node.findUnique({ where: { id: projectId } });
  if (!project || project.type !== "PROJECT" || project.archivedAt) throw notFound("project");
  const membership = await db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId: project.workspaceId } } });
  if (!membership) throw notFound("project");
  const preview = membership.role === "OWNER" || membership.role === "ADMIN";
  if (membership.role === "CLIENT") {
    const pm = await db.projectMember.findUnique({ where: { nodeId_userId: { nodeId: projectId, userId } } });
    if (!pm) throw notFound("project");
  } else if (!preview) {
    throw notFound("project"); // members and guests use the app, not the portal
  }
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: project.workspaceId }, select: { plan: true } });
  if (!hasFeature(ws.plan, "clientPortal")) throw planFeatureRequired("clientPortal");
  return { userId, membership, project, isClient: membership.role === "CLIENT" };
}

async function sharedNode(a: Access, nodeId: string): Promise<Node> {
  const n = await db.node.findUnique({ where: { id: nodeId } });
  if (!n || n.archivedAt || n.workspaceId !== a.project.workspaceId) throw notFound("node");
  if (n.id === a.project.id) return n;
  if (n.rootId !== a.project.id || !n.visibleToClient || !(SHAREABLE as readonly string[]).includes(n.type)) throw notFound("node");
  return n;
}

// ── lists and the project view ─────────────────────────────────────────────

export async function listPortalProjects(userId: string, workspaceId: string) {
  const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } }, include: { workspace: { select: { name: true, plan: true } } } });
  if (!m) throw notFound("workspace");
  const preview = m.role === "OWNER" || m.role === "ADMIN";
  if (m.role !== "CLIENT" && !preview) throw notFound("workspace");
  if (!hasFeature(m.workspace.plan, "clientPortal")) throw planFeatureRequired("clientPortal");
  const projects = await db.node.findMany({
    where: { workspaceId, type: "PROJECT", archivedAt: null, ...(m.role === "CLIENT" ? { projectAccess: { some: { userId } } } : {}) },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, progress: true, health: true, dueDate: true },
  });
  const pending = await db.approval.groupBy({ by: ["nodeId"], where: { status: "PENDING", node: { rootId: { in: projects.map((p) => p.id) }, visibleToClient: true, archivedAt: null } }, _count: true });
  const nodeRoot = new Map((await db.node.findMany({ where: { id: { in: pending.map((p) => p.nodeId) } }, select: { id: true, rootId: true } })).map((n) => [n.id, n.rootId]));
  const waiting = new Map<string, number>();
  for (const p of pending) waiting.set(nodeRoot.get(p.nodeId) ?? "", (waiting.get(nodeRoot.get(p.nodeId) ?? "") ?? 0) + p._count);
  return { workspace: { name: m.workspace.name }, items: projects.map((p) => ({ ...p, pendingApprovals: waiting.get(p.id) ?? 0 })) };
}

export async function getPortalProject(userId: string, projectId: string) {
  const a = await portalAccess(userId, projectId);
  const all = await db.node.findMany({ where: { rootId: projectId, archivedAt: null }, select: { id: true, parentId: true, visibleToClient: true, type: true } });
  const parent = new Map(all.map((n) => [n.id, n.parentId]));
  const shown = new Set(all.filter((n) => n.visibleToClient && (SHAREABLE as readonly string[]).includes(n.type)).map((n) => n.id));
  /** The nearest ancestor the client can see; the project itself when there is none. Hidden middle layers disappear. */
  const visibleParent = (id: string): string => {
    for (let p = parent.get(id) ?? null, hops = 0; p && hops < 30; p = parent.get(p) ?? null, hops++) if (p === projectId || shown.has(p)) return p;
    return projectId;
  };
  const rows = await db.node.findMany({ where: { id: { in: [...shown] } }, orderBy: [{ position: "asc" }] });
  const approvals = await db.approval.findMany({ where: { nodeId: { in: [...shown] } }, orderBy: { createdAt: "desc" }, take: 100 });
  const open = new Map(approvals.filter((x) => x.status === "PENDING").map((x) => [x.nodeId, x.id]));
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: a.project.workspaceId }, select: { name: true, slug: true } });
  return {
    workspace: ws,
    me: { canDecide: a.isClient, preview: !a.isClient },
    project: { id: a.project.id, title: a.project.title, progress: a.project.progress, health: a.project.healthOverride ?? a.project.health, startDate: a.project.startDate, dueDate: a.project.dueDate },
    // Only what a client may know: no assignees, estimates, time, internal descriptions or comments.
    nodes: rows.map((n) => ({
      id: n.id,
      parentId: visibleParent(n.id),
      type: n.type,
      title: n.title,
      status: n.status,
      progress: n.progress,
      health: n.healthOverride ?? n.health,
      startDate: n.startDate,
      dueDate: n.dueDate,
      approvalId: open.get(n.id) ?? null,
      ...(n.type === "DOCUMENT" ? { content: (n.data as { content?: unknown }).content ?? null } : {}),
      ...(n.type === "EVENT" ? { startsAt: (n.data as { startsAt?: string }).startsAt ?? null, endsAt: (n.data as { endsAt?: string }).endsAt ?? null } : {}),
    })),
    approvals: approvals.map((x) => ({ id: x.id, nodeId: x.nodeId, status: x.status, request: x.request, note: x.note, decidedAt: x.decidedAt, createdAt: x.createdAt })),
  };
}

export async function getPortalNode(userId: string, nodeId: string) {
  const n = await db.node.findUnique({ where: { id: nodeId }, select: { id: true, rootId: true, type: true } });
  if (!n) throw notFound("node");
  const a = await portalAccess(userId, n.type === "PROJECT" ? n.id : (n.rootId ?? ""));
  await sharedNode(a, nodeId);
  const [comments, attachments] = await Promise.all([
    db.comment.findMany({ where: { nodeId, visibleToClient: true }, orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, email: true } } } }),
    db.attachment.findMany({ where: { nodeId, visibleToClient: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const staff = new Set((await db.membership.findMany({ where: { workspaceId: a.project.workspaceId, role: { not: "CLIENT" } }, select: { userId: true } })).map((m) => m.userId));
  return {
    comments: comments.map((c) => ({ id: c.id, text: plainText(c.body), at: c.createdAt, author: c.author.name ?? c.author.email.split("@")[0], mine: c.authorId === userId, fromTeam: staff.has(c.authorId) })),
    attachments: attachments.map((x) => ({ id: x.id, fileName: x.fileName, size: x.size, mime: x.mime, createdAt: x.createdAt })),
  };
}

// ── what a client can do ───────────────────────────────────────────────────

const docOf = (text: string) => ({ type: "doc", content: text.split(/\n{2,}/).map((p) => ({ type: "paragraph", content: [{ type: "text", text: p.trim() }] })).filter((p) => p.content[0]?.text) });

function plainText(body: unknown): string {
  const walk = (n: unknown): string => {
    const x = n as { type?: string; text?: string; content?: unknown[] };
    if (x.type === "text") return x.text ?? "";
    return (x.content ?? []).map(walk).join(x.type === "doc" ? "\n\n" : "");
  };
  return walk(body);
}

export const portalCommentSchema = z.object({ text: z.string().trim().min(1).max(4000) });

/** Who on the team should hear about client activity on a node: its assignee and creator, and the project's creator. */
async function teamFor(a: Access, node: Node, exceptUserId: string): Promise<string[]> {
  const ids = [...new Set([node.assigneeId, node.createdById, a.project.createdById].filter((x): x is string => !!x && x !== exceptUserId))];
  if (ids.length === 0) return [];
  return (await db.membership.findMany({ where: { workspaceId: a.project.workspaceId, userId: { in: ids }, role: { not: "CLIENT" } }, select: { userId: true } })).map((m) => m.userId);
}

async function who(userId: string): Promise<string> {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } });
  return u.name ?? u.email;
}

export async function addPortalComment(userId: string, nodeId: string, input: z.infer<typeof portalCommentSchema>) {
  const base = await db.node.findUnique({ where: { id: nodeId }, select: { rootId: true, type: true, id: true } });
  if (!base) throw notFound("node");
  const a = await portalAccess(userId, base.type === "PROJECT" ? base.id : (base.rootId ?? ""));
  const node = await sharedNode(a, nodeId);
  const c = await db.comment.create({ data: { nodeId, authorId: userId, body: docOf(input.text) as Prisma.InputJsonValue, mentions: [], visibleToClient: true } });
  await logActivity(db, { workspaceId: node.workspaceId, nodeId, actorId: userId, action: a.isClient ? "client.comment" : "comment.created", diff: { commentId: c.id } });
  if (a.isClient) {
    const name = await who(userId);
    for (const t of await teamFor(a, node, userId)) {
      await notify({ userId: t, workspaceId: node.workspaceId, kind: "client_activity", title: `${name} commented on “${node.title}”`, body: input.text.slice(0, 200), url: `/projects/p/${a.project.id}?node=${nodeId}`, payload: { nodeId, commentId: c.id } });
    }
  }
  publishComment(a.project.id, nodeId, userId);
  return { id: c.id };
}

export const decisionSchema = z.object({ decision: z.enum(["APPROVED", "CHANGES_REQUESTED"]), note: z.string().trim().max(2000).optional() });

/** Only a client decides, and only on a pending request for a node that is still shared. A decision is final; a new request starts a new round. */
export async function decide(userId: string, approvalId: string, input: z.infer<typeof decisionSchema>, now = new Date()) {
  const ap = await db.approval.findUnique({ where: { id: approvalId }, include: { node: true } });
  if (!ap) throw notFound("approval");
  const a = await portalAccess(userId, ap.node.type === "PROJECT" ? ap.node.id : (ap.node.rootId ?? ""));
  const node = await sharedNode(a, ap.nodeId);
  if (!a.isClient) throw forbidden(); // previewing owners must not sign off on behalf of the client
  if (ap.status !== "PENDING") throw new ApiError(409, "already_decided", "This request was already answered");
  if (input.decision === "CHANGES_REQUESTED" && !input.note) throw new ApiError(422, "note_required", "Say what should change");
  const done = await db.approval.updateMany({ where: { id: approvalId, status: "PENDING" }, data: { status: input.decision, note: input.note ?? null, decidedById: userId, decidedAt: now } });
  if (done.count === 0) throw new ApiError(409, "already_decided", "This request was already answered"); // lost a race with another click
  await logActivity(db, { workspaceId: node.workspaceId, nodeId: node.id, actorId: userId, action: input.decision === "APPROVED" ? "approval.approved" : "approval.changes_requested", diff: { approvalId } });
  const name = await who(userId);
  for (const t of new Set([ap.requestedById, ...(await teamFor(a, node, userId))])) {
    await notify({ userId: t, workspaceId: node.workspaceId, kind: "client_activity", title: `${name} ${input.decision === "APPROVED" ? "approved" : "asked for changes on"} “${node.title}”`, body: input.note, url: `/projects/p/${a.project.id}?node=${node.id}`, payload: { approvalId, decision: input.decision } });
  }
  publishTreeSoon(a.project.id, userId);
  return { status: input.decision };
}

// ── files ──────────────────────────────────────────────────────────────────

export async function startPortalUpload(userId: string, nodeId: string, input: z.infer<typeof presignSchema>) {
  const base = await db.node.findUnique({ where: { id: nodeId }, select: { rootId: true, type: true, id: true } });
  if (!base) throw notFound("node");
  const a = await portalAccess(userId, base.type === "PROJECT" ? base.id : (base.rootId ?? ""));
  const node = await sharedNode(a, nodeId);
  const key = `${node.workspaceId}/${node.id}/${randomBytes(8).toString("hex")}-${safeFileName(input.fileName)}`;
  return { key, uploadUrl: await presignUpload(key, input.mime, input.size), headers: { "content-type": input.mime } };
}

export async function confirmPortalUpload(userId: string, nodeId: string, input: z.infer<typeof confirmSchema>) {
  const base = await db.node.findUnique({ where: { id: nodeId }, select: { rootId: true, type: true, id: true } });
  if (!base) throw notFound("node");
  const a = await portalAccess(userId, base.type === "PROJECT" ? base.id : (base.rootId ?? ""));
  const node = await sharedNode(a, nodeId);
  if (!input.key.startsWith(`${node.workspaceId}/${node.id}/`)) throw new ApiError(422, "invalid_key", "Upload key does not match this node");
  const att = await db.attachment.create({ data: { nodeId, fileName: input.fileName, mime: input.mime, size: input.size, url: input.key, uploadedById: userId, visibleToClient: true } });
  await logActivity(db, { workspaceId: node.workspaceId, nodeId, actorId: userId, action: a.isClient ? "client.attachment" : "attachment.added", diff: { fileName: input.fileName } });
  if (a.isClient) {
    const name = await who(userId);
    for (const t of await teamFor(a, node, userId)) await notify({ userId: t, workspaceId: node.workspaceId, kind: "client_activity", title: `${name} uploaded “${input.fileName}” to “${node.title}”`, url: `/projects/p/${a.project.id}?node=${nodeId}`, payload: { nodeId, attachmentId: att.id } });
  }
  return { id: att.id };
}

export async function portalDownloadUrl(userId: string, attachmentId: string): Promise<string> {
  const att = await db.attachment.findUnique({ where: { id: attachmentId }, include: { node: { select: { id: true, rootId: true, type: true } } } });
  if (!att || !att.visibleToClient) throw notFound("attachment");
  const a = await portalAccess(userId, att.node.type === "PROJECT" ? att.node.id : (att.node.rootId ?? ""));
  await sharedNode(a, att.nodeId);
  return presignDownload(att.url, att.fileName);
}

// ── the team's side ────────────────────────────────────────────────────────

export const requestApprovalSchema = z.object({ request: z.string().trim().max(1000).optional() });

/** Asks the project's clients to sign off on a node. The node must already be shared with them. */
export async function requestApproval(userId: string, nodeId: string, input: z.infer<typeof requestApprovalSchema>) {
  const { node, projectId } = await loadNode(db, userId, nodeId, "node:write");
  if (!node.visibleToClient || node.id === projectId) throw new ApiError(422, "not_shared", "Share the node with clients first");
  if (await db.approval.findFirst({ where: { nodeId, status: "PENDING" }, select: { id: true } })) throw new ApiError(409, "already_pending", "There is already a pending request for this node");
  const ap = await db.approval.create({ data: { nodeId, requestedById: userId, request: input.request ?? null } });
  await logActivity(db, { workspaceId: node.workspaceId, nodeId, actorId: userId, action: "approval.requested", diff: { approvalId: ap.id } });
  const name = await who(userId);
  const clients = await db.projectMember.findMany({ where: { nodeId: projectId, user: { memberships: { some: { workspaceId: node.workspaceId, role: "CLIENT" } } } }, select: { userId: true } });
  const slug = (await db.workspace.findUniqueOrThrow({ where: { id: node.workspaceId }, select: { slug: true } })).slug;
  for (const c of clients) await notify({ userId: c.userId, workspaceId: node.workspaceId, kind: "client_activity", title: `${name} asks for your approval: “${node.title}”`, body: input.request, url: `/portal/${slug}/p/${projectId}?node=${nodeId}` });
  publishTreeSoon(projectId, userId);
  return ap;
}

export async function listApprovals(userId: string, nodeId: string) {
  await loadNode(db, userId, nodeId);
  return db.approval.findMany({ where: { nodeId }, orderBy: { createdAt: "desc" }, take: 20 });
}

export async function setAttachmentVisibility(userId: string, attachmentId: string, visible: boolean) {
  const att = await db.attachment.findUnique({ where: { id: attachmentId } });
  if (!att) throw notFound("attachment");
  await loadNode(db, userId, att.nodeId, "node:write");
  await db.attachment.update({ where: { id: attachmentId }, data: { visibleToClient: visible } });
}
