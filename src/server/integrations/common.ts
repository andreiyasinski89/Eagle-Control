import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { hasFeature } from "@/modules/plans";
import { planFeatureRequired } from "@/server/services/metrics";

/** A third-party call failed. `status` is the provider's HTTP status when there was one. */
export class IntegrationError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly status?: number,
  ) {
    super(`${provider}: ${message}`);
  }
}

/**
 * JSON over HTTP with a timeout. Uses the global `fetch` (looked up per call) so tests can replace it with a fake provider.
 * Non-2xx and provider-level `{ ok: false }` answers (Slack) both become an IntegrationError.
 */
export async function httpJson<T>(provider: string, url: string, init: RequestInit & { json?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const { json, timeoutMs = 10_000, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(headers as Record<string, string> | undefined) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new IntegrationError(provider, e instanceof Error ? e.message : "request failed");
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* some endpoints answer with an empty or non-JSON body */
  }
  const providerError = (body as { error?: unknown } | null)?.error;
  if (!res.ok) throw new IntegrationError(provider, `${res.status} ${typeof providerError === "string" ? providerError : (providerError as { message?: string } | undefined)?.message ?? text.slice(0, 120)}`, res.status);
  if ((body as { ok?: unknown } | null)?.ok === false) throw new IntegrationError(provider, String(providerError ?? "request rejected"), res.status);
  return body as T;
}

export const safeEqual = (a: string, b: string): boolean => {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
};

/** Signed, expiring state for OAuth round trips (ties the callback to the person and workspace that started it). */
export function signState(payload: Record<string, unknown>, ttlMs = 10 * 60_000, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: now + ttlMs })).toString("base64url");
  const sig = createHmac("sha256", env().AUTH_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState<T extends Record<string, unknown>>(state: string | null | undefined, now = Date.now()): T | null {
  const [body, sig] = (state ?? "").split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", env().AUTH_SECRET).update(body).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
    return typeof data.exp === "number" && data.exp > now ? data : null;
  } catch {
    return null;
  }
}

/** Integrations are a Pro feature; the workspace's plan is checked on every entry point, not just in the UI. */
export async function requireIntegrations(workspaceId: string): Promise<void> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { plan: true } });
  if (!ws) throw new ApiError(404, "not_found", "workspace not found");
  if (!hasFeature(ws.plan, "integrations")) throw planFeatureRequired("integrations");
}

export const notConfigured = (what: string) => new ApiError(501, "not_configured", `${what} is not configured on this server`);

/** Slack messages carry absolute app paths, which include the workspace slug. */
export async function slugOf(workspaceId: string): Promise<string> {
  return (await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { slug: true } })).slug;
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const appUrl = () => env().APP_URL.replace(/\/$/, "");
