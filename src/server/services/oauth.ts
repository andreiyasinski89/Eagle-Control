import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import { ApiError, forbidden, notFound } from "@/server/http/errors";
import { hasFeature } from "@/modules/plans";
import { sha256 } from "@/server/integrations/common";
import { TOKEN_PREFIX } from "@/server/public-api/tokens";
import { loadWorkspaceMember } from "@/server/services/nodes/access";

/**
 * OAuth 2.1 for programs that act for a person through the MCP endpoint (Claude and others): dynamic client registration,
 * authorization code with PKCE (S256 only), short-lived access tokens, rotating refresh tokens. Access tokens are ordinary
 * API tokens tied to a grant, so everything the public API enforces (scope, plan, membership, rate limit, audit) applies unchanged.
 */

export const ACCESS_TOKEN_SECONDS = 3600;
export const REFRESH_TOKEN_DAYS = 30;
const CODE_MINUTES = 5;
const MAX_CLIENTS = 5000;

/** The OAuth error answers of RFC 6749: `error` is machine readable, the description is for people. */
export class OAuthError extends ApiError {
  constructor(
    public readonly oauth: "invalid_request" | "invalid_client" | "invalid_grant" | "unsupported_grant_type" | "invalid_scope" | "invalid_redirect_uri" | "invalid_target" | "access_denied" | "server_error",
    description: string,
    status = 400,
  ) {
    super(status, oauth, description);
  }
}

const random = () => randomBytes(32).toString("base64url");
const isLoopback = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "[::1]";

/** https anywhere, plain http only for a program on the same machine (Claude Code); no fragments, no credentials, no other schemes. */
export function validRedirectUri(raw: string): boolean {
  if (raw.length > 500) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  return u.protocol === "https:" || (u.protocol === "http:" && isLoopback(u.hostname));
}

/** Anthropic's own addresses and a program on this machine. Anything else can still connect, but the person is warned: anyone can register an app called "Claude". */
export function isKnownClientHost(redirectUri: string): boolean {
  try {
    const h = new URL(redirectUri).hostname;
    return isLoopback(h) || ["claude.ai", "claude.com"].some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

const clean = (s: string) => s.replace(/[\u0000-\u001f\u007f<>]/g, "").trim();

export const registerSchema = z.object({
  client_name: z.string().max(200).optional(),
  redirect_uris: z.array(z.string()).min(1).max(5),
  token_endpoint_auth_method: z.string().optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
});

/** RFC 7591. Anyone may register, which is the point; a client does nothing until a person approves it on the consent page. */
export async function registerClient(input: z.infer<typeof registerSchema>) {
  if (input.redirect_uris.some((u) => !validRedirectUri(u))) throw new OAuthError("invalid_redirect_uri", "Redirect URIs must be https (or http on localhost) without a fragment");
  if (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== "none") throw new OAuthError("invalid_request", "Only public clients (token_endpoint_auth_method none) are supported");
  if (input.grant_types && !input.grant_types.includes("authorization_code")) throw new OAuthError("invalid_request", "authorization_code must be a requested grant type");
  if ((await db.oAuthClient.count()) >= MAX_CLIENTS) throw new OAuthError("server_error", "Too many registered clients; try again later", 503);
  const row = await db.oAuthClient.create({ data: { name: clean(input.client_name ?? "") .slice(0, 80) || "An application", redirectUris: [...new Set(input.redirect_uris)] } });
  return { client_id: row.id, client_name: row.name, redirect_uris: row.redirectUris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000) };
}

export const authorizeParams = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1).max(100),
  redirect_uri: z.string().min(1).max(500),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "code_challenge must be the S256 hash, base64url without padding"),
  code_challenge_method: z.literal("S256"),
  state: z.string().max(500).optional(),
  scope: z.string().max(200).optional(),
  resource: z.string().max(500).optional(),
});
export type AuthorizeParams = z.infer<typeof authorizeParams>;

export interface ValidAuthorize {
  params: AuthorizeParams;
  client: { id: string; name: string };
}

/**
 * What the consent page and its POST both check. A bad client or redirect URI is never redirected to (it could be an attacker's),
 * so it throws and the caller shows an error page; anything else can be sent back to the client as an OAuth error.
 */
export async function validateAuthorize(raw: Record<string, string | undefined>, appUrl: string): Promise<ValidAuthorize> {
  const parsed = authorizeParams.safeParse(raw);
  const client = typeof raw.client_id === "string" ? await db.oAuthClient.findUnique({ where: { id: raw.client_id } }) : null;
  if (!client) throw new OAuthError("invalid_client", "Unknown application");
  if (!raw.redirect_uri || !client.redirectUris.includes(raw.redirect_uri)) throw new OAuthError("invalid_redirect_uri", "This redirect address was not registered for the application");
  if (!parsed.success) throw new OAuthError("invalid_request", parsed.error.issues[0]?.message ?? "Invalid request");
  const resource = parsed.data.resource;
  if (resource && resource.replace(/\/$/, "") !== `${appUrl}/api/mcp` && resource.replace(/\/$/, "") !== appUrl) throw new OAuthError("invalid_target", "The resource is not this server");
  return { params: parsed.data, client: { id: client.id, name: client.name } };
}

/** Workspaces the person may connect: not as a guest or client, and on a plan that includes the API. */
export async function connectableWorkspaces(userId: string) {
  const rows = await db.membership.findMany({ where: { userId, role: { notIn: ["GUEST", "CLIENT"] } }, include: { workspace: { select: { id: true, name: true, plan: true } } }, orderBy: { createdAt: "asc" } });
  return rows.filter((m) => hasFeature(m.workspace.plan, "api")).map((m) => ({ id: m.workspace.id, name: m.workspace.name, role: m.role }));
}

export async function issueCode(userId: string, v: ValidAuthorize, workspaceId: string, scope: "read" | "write", now = new Date()): Promise<string> {
  if (!(await connectableWorkspaces(userId)).some((w) => w.id === workspaceId)) throw forbidden();
  const code = random();
  await db.oAuthCode.create({ data: { codeHash: sha256(code), clientId: v.client.id, userId, workspaceId, scope, redirectUri: v.params.redirect_uri, codeChallenge: v.params.code_challenge, expiresAt: new Date(now.getTime() + CODE_MINUTES * 60_000) } });
  return code;
}

function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const a = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function mintTokens(grantId: string, userId: string, workspaceId: string, scope: string, name: string, now: Date) {
  const access = `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
  const refresh = random();
  await db.$transaction([
    db.apiToken.create({ data: { workspaceId, userId, name, scope, prefix: access.slice(0, 10), tokenHash: sha256(access), grantId, expiresAt: new Date(now.getTime() + ACCESS_TOKEN_SECONDS * 1000) } }),
    db.oAuthRefresh.create({ data: { tokenHash: sha256(refresh), grantId, expiresAt: new Date(now.getTime() + REFRESH_TOKEN_DAYS * 86_400_000) } }),
  ]);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TOKEN_SECONDS, refresh_token: refresh, scope };
}

/** The person must still belong to the workspace and the plan must still include the API, at the moment tokens are handed out. */
async function stillAllowed(userId: string, workspaceId: string): Promise<void> {
  if (!(await connectableWorkspaces(userId)).some((w) => w.id === workspaceId)) throw new OAuthError("invalid_grant", "Access to this workspace is no longer possible");
}

export async function exchangeCode(input: { code: string; clientId: string; redirectUri: string; codeVerifier: string }, now = new Date()) {
  const row = await db.oAuthCode.findUnique({ where: { codeHash: sha256(input.code) }, include: { client: { select: { name: true } } } });
  const bad = (msg: string) => new OAuthError("invalid_grant", msg);
  if (!row || row.clientId !== input.clientId || row.redirectUri !== input.redirectUri) throw bad("The authorization code is not valid");
  if (row.expiresAt <= now) throw bad("The authorization code has expired");
  if (!pkceMatches(input.codeVerifier, row.codeChallenge)) throw bad("The code verifier does not match");
  // Atomic: two parallel exchanges of one code cannot both win.
  const used = await db.oAuthCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  if (used.count !== 1) throw bad("The authorization code was already used");
  await stillAllowed(row.userId, row.workspaceId);
  const grant = await db.oAuthGrant.create({ data: { clientId: row.clientId, userId: row.userId, workspaceId: row.workspaceId, scope: row.scope } });
  return mintTokens(grant.id, row.userId, row.workspaceId, row.scope, `${row.client.name} (OAuth)`.slice(0, 80), now);
}

export async function refreshTokens(input: { refreshToken: string; clientId: string }, now = new Date()) {
  const row = await db.oAuthRefresh.findUnique({ where: { tokenHash: sha256(input.refreshToken) }, include: { grant: { include: { client: { select: { name: true } } } } } });
  const bad = (msg: string) => new OAuthError("invalid_grant", msg);
  if (!row || row.grant.clientId !== input.clientId || row.grant.revokedAt) throw bad("The refresh token is not valid");
  if (row.usedAt) {
    // A rotated token shows up again: either a retry bug or a stolen copy. Either way the grant ends, and the person reconnects.
    await endGrant(row.grantId, now);
    throw bad("The refresh token was already used; the connection was closed for safety");
  }
  if (row.expiresAt <= now) throw bad("The refresh token has expired");
  const used = await db.oAuthRefresh.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  if (used.count !== 1) throw bad("The refresh token was already used");
  await stillAllowed(row.grant.userId, row.grant.workspaceId);
  return mintTokens(row.grantId, row.grant.userId, row.grant.workspaceId, row.grant.scope, `${row.grant.client.name} (OAuth)`.slice(0, 80), now);
}

async function endGrant(grantId: string, now: Date): Promise<void> {
  await db.$transaction([db.oAuthGrant.update({ where: { id: grantId }, data: { revokedAt: now } }), db.apiToken.updateMany({ where: { grantId, revokedAt: null }, data: { revokedAt: now } }), db.oAuthRefresh.deleteMany({ where: { grantId } })]);
}

/** The people who connected Claude (or another program) to a workspace. Owners and admins see everyone's, others their own. */
export async function listGrants(userId: string, workspaceId: string) {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  if (m.role === "GUEST" || m.role === "CLIENT") throw forbidden();
  const admin = m.role === "OWNER" || m.role === "ADMIN";
  const rows = await db.oAuthGrant.findMany({ where: { workspaceId, revokedAt: null, ...(admin ? {} : { userId }) }, orderBy: { createdAt: "desc" }, include: { client: { select: { name: true } }, user: { select: { name: true, email: true } } } });
  const used = await db.apiToken.groupBy({ by: ["grantId"], where: { grantId: { in: rows.map((r) => r.id) } }, _max: { lastUsedAt: true } });
  const lastUsed = new Map(used.map((u) => [u.grantId, u._max.lastUsedAt]));
  return rows.map((g) => ({ id: g.id, app: g.client.name, scope: g.scope, createdAt: g.createdAt, lastUsedAt: lastUsed.get(g.id) ?? null, owner: g.user.name ?? g.user.email, mine: g.userId === userId }));
}

/** Owners and admins may end anyone's connection; everyone else only their own. */
export async function revokeGrant(userId: string, grantId: string, now = new Date()): Promise<void> {
  const g = await db.oAuthGrant.findUnique({ where: { id: grantId } });
  if (!g) throw notFound("connection");
  const m = await loadWorkspaceMember(db, userId, g.workspaceId, "workspace:read");
  if (g.userId !== userId && m.role !== "OWNER" && m.role !== "ADMIN") throw forbidden();
  await endGrant(grantId, now);
}

/** Daily housekeeping: spent codes, used or expired refresh tokens, expired OAuth access tokens, applications nobody approved. */
export async function purgeOAuth(now = new Date()): Promise<number> {
  const day = 86_400_000;
  // In this order: a client can only go once its spent codes have.
  const codes = await db.oAuthCode.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null }, createdAt: { lt: new Date(now.getTime() - day) } }] } });
  const refresh = await db.oAuthRefresh.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { lt: new Date(now.getTime() - day) } }] } });
  const access = await db.apiToken.deleteMany({ where: { grantId: { not: null }, OR: [{ expiresAt: { lt: new Date(now.getTime() - day) } }, { revokedAt: { lt: new Date(now.getTime() - 30 * day) } }] } });
  const clients = await db.oAuthClient.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * day) }, grants: { none: {} }, codes: { none: {} } } });
  return codes.count + refresh.count + access.count + clients.count;
}
