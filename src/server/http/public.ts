import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "./errors";
import { clientIp, readJson } from "./limits";
import { rateLimit } from "./rate-limit";

/** Pseudonymous client fingerprint: enough to spot abuse, not enough to identify a person. */
export function ipHash(req: NextRequest): string {
  const ip = clientIp(req.headers);
  return createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

export function corsHeaders(req: NextRequest, allowed: readonly string[] | null): Record<string, string> {
  const origin = req.headers.get("origin");
  const base: Record<string, string> = { "access-control-allow-methods": "POST, GET, OPTIONS", "access-control-allow-headers": "content-type, idempotency-key, authorization", "access-control-max-age": "600", vary: "origin" };
  if (!allowed || allowed.length === 0) return { ...base, "access-control-allow-origin": "*" };
  if (origin && allowed.includes(origin)) return { ...base, "access-control-allow-origin": origin };
  return base;
}

/** For browsers: a request from a site that is not on the allow-list is refused outright. */
export function assertOriginAllowed(req: NextRequest, allowed: readonly string[]): void {
  const origin = req.headers.get("origin");
  if (allowed.length > 0 && origin && !allowed.includes(origin)) throw new ApiError(403, "origin_not_allowed", "This site may not submit to this form");
}

export function guard(req: NextRequest, scope: string, limit: number, windowMs = 60_000): void {
  if (!rateLimit(`${scope}:${ipHash(req)}`, limit, windowMs)) throw new ApiError(429, "rate_limited", "Too many requests");
}

export function publicError(err: unknown, headers: Record<string, string> = {}): NextResponse {
  if (err instanceof ApiError) return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status, headers });
  if (err instanceof ZodError) return NextResponse.json({ error: { code: "validation", message: "Invalid input" } }, { status: 400, headers });
  console.error(err);
  return NextResponse.json({ error: { code: "internal", message: "Internal error" } }, { status: 500, headers });
}

/** JSON, urlencoded and multipart bodies (plain HTML forms) all become one flat object. */
export async function readLeadBody(req: NextRequest): Promise<{ data: Record<string, unknown>; isForm: boolean }> {
  const type = req.headers.get("content-type") ?? "";
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > 64 * 1024) throw new ApiError(413, "too_large", "Payload is too large");
  if (type.includes("application/json")) {
    try {
      const body: unknown = await readJson(req, 64 * 1024);
      if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("not an object");
      return { data: body as Record<string, unknown>, isForm: false };
    } catch {
      throw new ApiError(400, "invalid_json", "Body must be a JSON object");
    }
  }
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await req.formData();
    const data: Record<string, unknown> = {};
    for (const [k, v] of form.entries()) if (typeof v === "string") data[k] = v;
    return { data, isForm: true };
  }
  throw new ApiError(415, "unsupported_media_type", "Send JSON or a form");
}
