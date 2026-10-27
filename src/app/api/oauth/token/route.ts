import type { NextRequest } from "next/server";
import { clientIp, readText } from "@/server/http/limits";
import { rateLimit } from "@/server/http/rate-limit";
import { oauthFailure, oauthJson, preflight } from "@/server/http/oauth-http";
import { exchangeCode, OAuthError, refreshTokens } from "@/server/services/oauth";

export const dynamic = "force-dynamic";
export { preflight as OPTIONS };

async function readParams(req: NextRequest): Promise<Record<string, string>> {
  const raw = await readText(req, 20_000);
  if ((req.headers.get("content-type") ?? "").includes("json")) {
    const j = JSON.parse(raw || "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(j).filter(([, v]) => typeof v === "string")) as Record<string, string>;
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

/** The token endpoint: authorization_code (with the PKCE verifier) and refresh_token. Public clients only, so no client secret. */
export async function POST(req: NextRequest) {
  try {
    if (!rateLimit(`oauth-token:${clientIp(req.headers)}`, 60, 60_000)) throw new OAuthError("server_error", "Too many requests", 429);
    const p = await readParams(req).catch(() => {
      throw new OAuthError("invalid_request", "The body must be form-encoded or JSON");
    });
    if (!p.client_id) throw new OAuthError("invalid_client", "client_id is required", 401);
    if (p.grant_type === "authorization_code") {
      if (!p.code || !p.redirect_uri || !p.code_verifier) throw new OAuthError("invalid_request", "code, redirect_uri and code_verifier are required");
      return oauthJson(await exchangeCode({ code: p.code, clientId: p.client_id, redirectUri: p.redirect_uri, codeVerifier: p.code_verifier }));
    }
    if (p.grant_type === "refresh_token") {
      if (!p.refresh_token) throw new OAuthError("invalid_request", "refresh_token is required");
      return oauthJson(await refreshTokens({ refreshToken: p.refresh_token, clientId: p.client_id }));
    }
    throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token");
  } catch (e) {
    return oauthFailure(e);
  }
}
