import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import { ApiError, forbidden, notFound } from "@/server/http/errors";
import { hasFeature } from "@/modules/plans";
import { planFeatureRequired } from "@/server/services/metrics";
import { sha256 } from "@/server/integrations/common";
import { loadWorkspaceMember } from "@/server/services/nodes/access";

export const TOKEN_PREFIX = "mo_";

export const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scope: z.enum(["read", "write"]).default("read"),
  /** Days until it stops working; omitted = never. */
  expiresInDays: z.number().int().min(1).max(730).nullable().default(90),
});

async function manage(userId: string, workspaceId: string) {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  if (m.role === "GUEST" || m.role === "CLIENT") throw forbidden(); // outside people never get programmatic access
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { plan: true } });
  if (!hasFeature(ws.plan, "api")) throw planFeatureRequired("api");
  return m;
}

/** The token itself is shown once. Afterwards only its first characters and a hash exist. */
export async function createToken(userId: string, workspaceId: string, input: z.infer<typeof createTokenSchema>, now = new Date()) {
  await manage(userId, workspaceId);
  if ((await db.apiToken.count({ where: { workspaceId, userId, revokedAt: null, grantId: null } })) >= 20) throw new ApiError(422, "too_many_tokens", "Revoke an old token before creating another");
  const token = `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
  const row = await db.apiToken.create({
    data: { workspaceId, userId, name: input.name, scope: input.scope, prefix: token.slice(0, 10), tokenHash: sha256(token), expiresAt: input.expiresInDays ? new Date(now.getTime() + input.expiresInDays * 86_400_000) : null },
  });
  return { id: row.id, token, name: row.name, scope: row.scope, expiresAt: row.expiresAt };
}

export async function listTokens(userId: string, workspaceId: string) {
  const m = await manage(userId, workspaceId);
  const admin = m.role === "OWNER" || m.role === "ADMIN";
  const rows = await db.apiToken.findMany({ where: { workspaceId, revokedAt: null, grantId: null, ...(admin ? {} : { userId }) }, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true, email: true } } } });
  return rows.map((t) => ({ id: t.id, name: t.name, prefix: t.prefix, scope: t.scope, expiresAt: t.expiresAt, lastUsedAt: t.lastUsedAt, createdAt: t.createdAt, owner: t.user.name ?? t.user.email, mine: t.userId === userId }));
}

/** Owners and admins may revoke anyone's token; everyone else only their own. */
export async function revokeToken(userId: string, tokenId: string): Promise<void> {
  const t = await db.apiToken.findUnique({ where: { id: tokenId } });
  if (!t) throw notFound("token");
  const m = await loadWorkspaceMember(db, userId, t.workspaceId, "workspace:read");
  if (t.userId !== userId && m.role !== "OWNER" && m.role !== "ADMIN") throw forbidden();
  await db.apiToken.update({ where: { id: tokenId }, data: { revokedAt: new Date() } });
}

export interface TokenContext {
  tokenId: string;
  workspaceId: string;
  userId: string;
  scope: "read" | "write";
}

/**
 * Turns an `Authorization: Bearer mo_…` header into who may act. Fails closed: unknown, revoked or expired tokens,
 * people who left the workspace, and workspaces that dropped below the plan all look the same to the caller (401/402).
 */
export async function authenticate(header: string | null, now = new Date()): Promise<TokenContext> {
  const raw = header?.match(/^Bearer\s+(\S+)$/i)?.[1];
  const unauthorized = () => new ApiError(401, "invalid_token", "Missing, expired or revoked API token");
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) throw unauthorized();
  const t = await db.apiToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { workspace: { select: { plan: true } } } });
  if (!t || t.revokedAt || (t.expiresAt && t.expiresAt <= now)) throw unauthorized();
  const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId: t.userId, workspaceId: t.workspaceId } } });
  if (!m || m.role === "GUEST" || m.role === "CLIENT") throw unauthorized();
  if (!hasFeature(t.workspace.plan, "api")) throw planFeatureRequired("api");
  if (!t.lastUsedAt || now.getTime() - t.lastUsedAt.getTime() > 60_000) await db.apiToken.update({ where: { id: t.id }, data: { lastUsedAt: now } });
  return { tokenId: t.id, workspaceId: t.workspaceId, userId: t.userId, scope: t.scope === "write" ? "write" : "read" };
}
