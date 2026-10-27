import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "@/server/http/errors";
import { OAuthError } from "@/server/services/oauth";

/** Public endpoints of the OAuth flow carry no cookies, so browser-based MCP tools may call them from anywhere. */
export const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type, authorization, mcp-protocol-version", "access-control-max-age": "86400" };
export const NO_STORE = { "cache-control": "no-store", pragma: "no-cache" };

export const preflight = () => new NextResponse(null, { status: 204, headers: CORS });

export function oauthJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { ...CORS, ...NO_STORE } });
}

/** RFC 6749 §5.2 error body. Unknown failures are never described to the caller. */
export function oauthFailure(e: unknown): NextResponse {
  if (e instanceof OAuthError) return oauthJson({ error: e.oauth, error_description: e.message }, e.status);
  if (e instanceof ZodError) return oauthJson({ error: "invalid_request", error_description: e.issues[0]?.message ?? "Invalid request" }, 400);
  if (e instanceof ApiError && e.status === 413) return oauthJson({ error: "invalid_request", error_description: "The request body is too large" }, 413);
  console.error("oauth", e);
  return oauthJson({ error: "server_error", error_description: "Something went wrong" }, 500);
}
