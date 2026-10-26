import { z } from "zod";
import { db } from "@/server/db";
import { ApiError, forbidden } from "@/server/http/errors";
import { rateLimit } from "@/server/http/rate-limit";
import { hasFeature } from "@/modules/plans";
import { AI_MONTHLY_TOKENS, monthKey, monthStart, quotaState } from "@/modules/plans/ai";
import { allowedChildTypes } from "@/modules/nodes/node-rules";
import { clip, dealContext, MAX_TOKENS, parseBreakdown, projectContext, systemFor, type AiFeature, type ContextNode, type Suggestion } from "@/modules/ai/prompts";
import { planFeatureRequired } from "@/server/services/metrics";
import { getDeal } from "@/server/services/crm/deals";
import { loadNode, loadWorkspaceMember, logActivity } from "@/server/services/nodes/access";
import { createNode, transact } from "@/server/services/nodes/ops";
import { getTree } from "@/server/services/nodes/queries";
import { notify } from "@/server/services/notify";
import { provider, type AiResult } from "./provider";

const CALLS_PER_MINUTE = 20;

export class AiQuotaError extends ApiError {
  constructor(details: Record<string, unknown>) {
    super(402, "ai_quota", "This month's AI allowance is used up. It renews on the 1st.", details);
  }
}

async function usedTokens(workspaceId: string, now: Date): Promise<number> {
  const sum = await db.aiUsage.aggregate({ where: { workspaceId, createdAt: { gte: monthStart(now) } }, _sum: { inputTokens: true, outputTokens: true } });
  return (sum._sum.inputTokens ?? 0) + (sum._sum.outputTokens ?? 0);
}

/** Who may use AI, on which plan, within which allowance. Runs before anything is read or sent to the model. */
async function gate(userId: string, workspaceId: string, now: Date) {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read"); // clients are refused here
  if (m.role === "GUEST") throw forbidden();
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { plan: true } });
  if (!hasFeature(ws.plan, "ai")) throw planFeatureRequired("ai");
  if (!rateLimit(`ai:${userId}`, CALLS_PER_MINUTE, 60_000, now.getTime())) throw new ApiError(429, "rate_limited", "Too many AI requests. Wait a minute.");
  const used = await usedTokens(workspaceId, now);
  const q = quotaState(ws.plan, used);
  if (q.exhausted) {
    if (q.quota > 0) await warnOwners(workspaceId, "100", ws.plan, used, now); // someone just hit the wall: the owner should hear about it
    throw new AiQuotaError({ used: q.used, quota: q.quota });
  }
  return { plan: ws.plan, used };
}

/** Records what the call cost (counts only, never the text) and warns the owners once at 80% and once at 100%. */
async function record(userId: string, workspaceId: string, feature: AiFeature, r: AiResult, plan: "FREE" | "PRO" | "ENTERPRISE", before: number, now: Date) {
  await db.aiUsage.create({ data: { workspaceId, userId, feature, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens } });
  const after = before + r.inputTokens + r.outputTokens;
  const q = quotaState(plan, after);
  const level = q.exhausted ? "100" : q.warn ? "80" : null;
  if (level) await warnOwners(workspaceId, level, plan, after, now);
}

/** Once per month and level (the notification key sees to that). */
async function warnOwners(workspaceId: string, level: "80" | "100", plan: "FREE" | "PRO" | "ENTERPRISE", used: number, now: Date) {
  const owners = await db.membership.findMany({ where: { workspaceId, role: "OWNER" }, select: { userId: true } });
  for (const o of owners) {
    await notify({
      userId: o.userId,
      workspaceId,
      kind: "billing",
      title: level === "100" ? "The AI allowance for this month is used up" : "80% of this month's AI allowance is used",
      body: `${used.toLocaleString("en")} of ${AI_MONTHLY_TOKENS[plan].toLocaleString("en")} tokens`,
      url: "/settings/billing",
      dedupeKey: `ai${level}:${workspaceId}:${monthKey(now)}`,
    });
  }
}

async function run(userId: string, workspaceId: string, feature: AiFeature, user: string, now = new Date()): Promise<AiResult> {
  const { plan, used } = await gate(userId, workspaceId, now);
  const p = provider();
  const result = await p.complete({ feature, system: systemFor(feature), user, maxTokens: MAX_TOKENS[feature] });
  await record(userId, workspaceId, feature, result, plan, used, now);
  return result;
}

const today = (now: Date) => now.toISOString().slice(0, 10);
const plain = (body: unknown): string => {
  const walk = (n: unknown): string => {
    const x = n as { type?: string; text?: string; content?: unknown[] };
    return x.type === "text" ? (x.text ?? "") : (x.content ?? []).map(walk).join(" ");
  };
  return walk(body);
};

// ── features ───────────────────────────────────────────────────────────────

export const summarySchema = z.object({ projectId: z.string(), audience: z.enum(["team", "client"]).default("team") });

/**
 * "team": the whole project as the caller may see it, plus recent comments. "client": only what is shared with clients,
 * with no people, comments or estimates, so the draft cannot carry anything internal.
 */
export async function summarize(userId: string, input: z.infer<typeof summarySchema>, now = new Date()) {
  const { node: project } = await loadNode(db, userId, input.projectId);
  if (project.type !== "PROJECT") throw new ApiError(404, "not_found", "project not found");
  let context: string;
  if (input.audience === "client") {
    const shared = await db.node.findMany({ where: { rootId: project.id, archivedAt: null, visibleToClient: true, type: { in: ["EPIC", "SPRINT", "TASK", "SUBTASK", "DOCUMENT", "EVENT"] } }, orderBy: { position: "asc" }, take: 200 });
    context = projectContext({ title: project.title, progress: project.progress, health: project.healthOverride ?? project.health, dueDate: project.dueDate?.toISOString() ?? null, today: today(now), nodes: shared.map((n) => ({ type: n.type, title: n.title, status: n.status, progress: n.progress, health: n.healthOverride ?? n.health, dueDate: n.dueDate?.toISOString() ?? null })) });
  } else {
    context = await teamContext(userId, project.id, now, true);
  }
  const r = await run(userId, project.workspaceId, input.audience === "client" ? "client_report" : "summary", context, now);
  return { text: r.text, tokens: r.inputTokens + r.outputTokens };
}

async function teamContext(userId: string, projectId: string, now: Date, withComments: boolean): Promise<string> {
  const tree = await getTree(userId, projectId, now);
  const person = new Map(tree.people.map((p) => [p.id, p.name ?? p.email]));
  const title = new Map(tree.nodes.map((n) => [n.id, n.title]));
  const nodes: ContextNode[] = tree.nodes
    .filter((n) => n.id !== projectId && n.type !== "DOCUMENT")
    .map((n) => ({ type: n.type, title: n.title, status: n.status, progress: n.progress, health: n.healthOverride ?? n.health, dueDate: n.dueDate?.toISOString() ?? null, assignee: n.assigneeId ? (person.get(n.assigneeId) ?? null) : null, blocked: n.blocked, parent: n.parentId && n.parentId !== projectId ? (title.get(n.parentId) ?? null) : null }));
  const comments = withComments ? await db.comment.findMany({ where: { node: { rootId: projectId, archivedAt: null } }, orderBy: { createdAt: "desc" }, take: 12, include: { node: { select: { title: true } } } }) : [];
  const root = tree.nodes.find((n) => n.id === projectId);
  return projectContext({ title: tree.project.title, progress: root?.progress ?? 0, health: root?.healthOverride ?? root?.health ?? "GREEN", dueDate: root?.dueDate?.toISOString() ?? null, today: today(now), nodes, notes: comments.map((c) => `On "${clip(c.node.title, 60)}": ${plain(c.body)}`) });
}

export const askSchema = z.object({ projectId: z.string(), question: z.string().trim().min(3).max(500) });

export async function ask(userId: string, input: z.infer<typeof askSchema>, now = new Date()) {
  const { node: project } = await loadNode(db, userId, input.projectId);
  if (project.type !== "PROJECT") throw new ApiError(404, "not_found", "project not found");
  const context = await teamContext(userId, project.id, now, true);
  const r = await run(userId, project.workspaceId, "ask", `${context}\n<question>${input.question}</question>`, now);
  return { text: r.text, tokens: r.inputTokens + r.outputTokens };
}

export const breakdownSchema = z.object({ nodeId: z.string() });

/** Suggestions only: nothing is created until a person picks some and calls `applyBreakdown`. */
export async function breakdown(userId: string, input: z.infer<typeof breakdownSchema>, now = new Date()): Promise<{ childType: "TASK" | "SUBTASK"; suggestions: Suggestion[] }> {
  const { node, projectId } = await loadNode(db, userId, input.nodeId, "node:write");
  const childType = allowedChildTypes(node.type).includes("SUBTASK") ? "SUBTASK" : allowedChildTypes(node.type).includes("TASK") ? "TASK" : null;
  if (!childType) throw new ApiError(422, "not_supported", "Subtasks cannot be added under this kind of node");
  const parent = node.parentId ? await db.node.findUnique({ where: { id: node.parentId }, select: { title: true } }) : null;
  const siblings = await db.node.findMany({ where: { parentId: node.id, archivedAt: null }, select: { title: true }, take: 30 });
  const user = [
    "<data>",
    `Project: ${clip((await db.node.findUnique({ where: { id: projectId }, select: { title: true } }))?.title, 120)}`,
    `${node.type} "${clip(node.title, 160)}"${parent ? ` inside "${clip(parent.title, 100)}"` : ""}`,
    node.description ? `Description: ${clip(node.description, 1200)}` : "No description.",
    siblings.length ? `Already planned under it: ${siblings.map((s) => `"${clip(s.title, 80)}"`).join(", ")}` : "Nothing is planned under it yet.",
    "</data>",
  ].join("\n");
  const r = await run(userId, node.workspaceId, "breakdown", user, now);
  const suggestions = parseBreakdown(r.text);
  if (!suggestions) throw new ApiError(502, "ai_bad_output", "The AI did not return usable subtasks. Try again.");
  const existing = new Set(siblings.map((s) => s.title.toLowerCase()));
  return { childType, suggestions: suggestions.filter((s) => !existing.has(s.title.toLowerCase())) };
}

export const applyBreakdownSchema = z.object({ nodeId: z.string(), items: z.array(z.object({ title: z.string().trim().min(1).max(120), estimation: z.number().positive().max(200).nullable().optional() })).min(1).max(12) });

/** The person chose these; creating them is an ordinary, permission-checked edit. */
export async function applyBreakdown(userId: string, input: z.infer<typeof applyBreakdownSchema>) {
  const { node } = await loadNode(db, userId, input.nodeId, "node:write");
  const childType = allowedChildTypes(node.type).includes("SUBTASK") ? "SUBTASK" : "TASK";
  const { result } = await transact(userId, async (ctx) => {
    const ids: string[] = [];
    for (const it of input.items) ids.push((await createNode(ctx, { parentId: node.id, type: childType, title: it.title, ...(it.estimation ? { estimation: it.estimation } : {}) } as never)).id);
    await logActivity(ctx.tx, { workspaceId: node.workspaceId, nodeId: node.id, actorId: userId, action: "ai.breakdown_applied", diff: { count: ids.length } });
    return ids;
  });
  return { ids: result };
}

export const leadReplySchema = z.object({ dealId: z.string(), intent: z.string().trim().max(300).optional() });

export async function leadReply(userId: string, input: z.infer<typeof leadReplySchema>, now = new Date()) {
  const deal = await getDeal(userId, input.dealId); // needs CRM access
  const node = await db.node.findUniqueOrThrow({ where: { id: input.dealId }, select: { workspaceId: true } });
  const stage = deal.stages.find((s) => s.id === deal.stageId);
  const context = dealContext({ title: deal.title, stage: stage?.name ?? "", amount: deal.amount, currency: deal.currency, company: deal.companyName, contact: deal.contactName, nextStep: deal.nextStep, today: today(now), activities: deal.activities.map((a) => ({ type: a.type, subject: a.subject, body: a.body, at: a.createdAt.toISOString() })) });
  const r = await run(userId, node.workspaceId, "lead_reply", `${context}${input.intent ? `\n<question>What the salesperson wants to say: ${input.intent}</question>` : ""}`, now);
  return { text: r.text, tokens: r.inputTokens + r.outputTokens };
}

export async function aiStatus(userId: string, workspaceId: string, now = new Date()) {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { plan: true } });
  const q = quotaState(ws.plan, await usedTokens(workspaceId, now));
  let ready = true;
  try {
    provider();
  } catch {
    ready = false;
  }
  return { allowed: hasFeature(ws.plan, "ai") && m.role !== "GUEST", configured: ready, used: q.used, quota: q.quota, warn: q.warn, exhausted: q.exhausted, renewsOn: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10) };
}
