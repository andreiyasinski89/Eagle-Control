import type { Node, NodeType, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { ApiError, notFound } from "@/server/http/errors";
import { loadNode, type Tx } from "@/server/services/nodes/access";

/** Defaults for the stagnation heatmap; per-workspace settings can override them later. */
export const STALE_DAYS = 14;
export const STUCK_DAYS = 30;
export const NO_TOUCH_DAYS = 30;

export const toNum = (d: Prisma.Decimal | number | null | undefined): number => (d === null || d === undefined ? 0 : Number(d));

export const fullName = (first: string, last: string | null | undefined) => [first, last].filter(Boolean).join(" ").trim();

export const invalid = (code: string, message: string, details?: Record<string, unknown>) => new ApiError(422, code, message, details);

/** Loads a CRM node of the expected type; wrong type or missing = 404 (never reveals another type's id). */
export async function loadCrmNode(tx: Tx, userId: string, nodeId: string, type: NodeType, write = false): Promise<Node> {
  const { node } = await loadNode(tx, userId, nodeId, write ? "node:write" : "workspace:read");
  if (node.type !== type) throw notFound(type.toLowerCase());
  return node;
}

/** Owners and assignees must be real members (clients excluded) of the workspace. */
export async function assertWorkspaceMember(tx: Tx, workspaceId: string, userId: string | null | undefined): Promise<void> {
  if (!userId) return;
  const m = await tx.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  if (!m || m.role === "CLIENT") throw invalid("invalid_owner", "Owner must be a member of the workspace");
}

export const toDate = (v: string | Date | null | undefined): Date | null => (v === null || v === undefined ? null : new Date(v));

export interface Page {
  page: number;
  pageSize: number;
}

export function pageArgs(p: Partial<Page>): { skip: number; take: number; page: number; pageSize: number } {
  const pageSize = Math.min(Math.max(p.pageSize ?? 50, 1), 200);
  const page = Math.max(p.page ?? 1, 1);
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

/**
 * A CRM write as one transaction with room to finish. A change to a person is a dozen small queries (the stage event, the next step, the
 * temperature, the log, the card read back); with the database far from the server, or waking up, they can pass Prisma's default 5 seconds,
 * and then everything is rolled back and the screen quietly snaps back (a card dragged to another stage returned to its place).
 */
export const CRM_TX = { timeout: 30_000, maxWait: 15_000 } as const;
export function crmTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction((tx) => fn(tx as Tx), CRM_TX);
}
