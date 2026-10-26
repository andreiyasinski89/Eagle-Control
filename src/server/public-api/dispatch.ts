import { ZodError } from "zod";
import { db } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { rateLimit } from "@/server/http/rate-limit";
import type { Prisma } from "@prisma/client";
import { endpoints, matcher, type Page } from "./endpoints";
import { authenticate } from "./tokens";

const compiled = endpoints.map((e) => ({ e, match: matcher(e.path) }));
export const RATE_LIMIT = 600; // requests per token per minute
const IDEMPOTENCY_TTL_MS = 24 * 3_600_000;

export interface ApiResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

const err = (status: number, code: string, message: string, extra: object = {}, headers: Record<string, string> = {}): ApiResponse => ({ status, body: { error: { code, message, ...extra } }, headers });

const encodeCursor = (page: number, pageSize: number) => Buffer.from(JSON.stringify({ p: page, s: pageSize })).toString("base64url");
function decodeCursor(c: string | null): Page | null {
  if (!c) return null;
  try {
    const v = JSON.parse(Buffer.from(c, "base64url").toString("utf8")) as { p?: number; s?: number };
    return Number.isInteger(v.p) && Number.isInteger(v.s) && (v.p as number) >= 1 && (v.s as number) >= 1 && (v.s as number) <= 100 ? { page: v.p as number, pageSize: v.s as number } : null;
  } catch {
    return null;
  }
}

/**
 * One entry point for every public API call: token, plan, scope, rate limit, input validation, idempotency, audit.
 * `path` is relative to `/api/public/v1`.
 */
export async function dispatch(method: string, path: string, search: URLSearchParams, headers: Headers, readBody: () => Promise<unknown>, now = new Date()): Promise<ApiResponse> {
  try {
    const t = await authenticate(headers.get("authorization"), now);

    // Counted before anything else, so floods of invalid requests are limited too.
    const key = `public:${t.tokenId}`;
    const allowed = rateLimit(key, RATE_LIMIT, 60_000, now.getTime());
    const rl = { "x-ratelimit-limit": String(RATE_LIMIT) };
    if (!allowed) return err(429, "rate_limited", "Too many requests", {}, { ...rl, "retry-after": "30", "x-ratelimit-remaining": "0" });

    const hit = compiled.map((c) => ({ c, params: c.match(path) })).find((x) => x.params && x.c.e.method === method);
    if (!hit) {
      const otherMethod = compiled.some((c) => c.match(path));
      return otherMethod ? err(405, "method_not_allowed", "Method not allowed for this path", {}, rl) : err(404, "not_found", "Unknown endpoint", {}, rl);
    }
    const { e } = hit.c;
    if (e.write && t.scope !== "write") return err(403, "insufficient_scope", "This token is read-only", {}, rl);

    const idemKey = method === "POST" ? headers.get("idempotency-key")?.slice(0, 120) || null : null;
    if (idemKey) {
      const prior = await db.apiIdempotency.findUnique({ where: { tokenId_key: { tokenId: t.tokenId, key: idemKey } } });
      if (prior && now.getTime() - prior.createdAt.getTime() < IDEMPOTENCY_TTL_MS) return { status: prior.status, body: prior.body, headers: { ...rl, "idempotent-replayed": "true" } };
    }

    const query = Object.fromEntries(search);
    const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 100);
    const cursor = decodeCursor(search.get("cursor"));
    if (search.get("cursor") && !cursor) return err(400, "invalid_cursor", "The cursor is not valid", {}, rl);
    const page: Page = cursor ?? { page: 1, pageSize: limit };
    delete query.limit;
    delete query.cursor;

    const parsedQuery = e.query ? e.query.parse(query) : {};
    const parsedBody = e.body ? e.body.parse(await readBody().catch(() => { throw new ApiError(400, "invalid_json", "Body must be valid JSON"); })) : {};
    const out = await e.run({ t, params: hit.params as Record<string, string>, query: parsedQuery, body: parsedBody, page });

    let res: ApiResponse;
    if ("items" in out) {
      const more = out.total !== undefined ? page.page * page.pageSize < out.total : out.items.length === page.pageSize;
      res = { status: 200, body: { items: out.items, nextCursor: more ? encodeCursor(page.page + 1, page.pageSize) : null, ...(out.total !== undefined ? { total: out.total } : {}) }, headers: rl };
    } else {
      res = { status: out.status ?? 200, body: { data: out.data }, headers: rl };
    }

    if (e.write) {
      await db.activityLog.create({ data: { workspaceId: t.workspaceId, nodeId: null, actorId: t.userId, action: "api.write", diff: { method, path, tokenId: t.tokenId, status: res.status } as Prisma.InputJsonValue } });
    }
    if (idemKey && res.status < 300) {
      await db.apiIdempotency.upsert({
        where: { tokenId_key: { tokenId: t.tokenId, key: idemKey } },
        create: { tokenId: t.tokenId, key: idemKey, status: res.status, body: JSON.parse(JSON.stringify(res.body)) as Prisma.InputJsonValue },
        update: {},
      }).catch(() => undefined); // two parallel retries: the first one wins
    }
    return res;
  } catch (e) {
    if (e instanceof ApiError) return err(e.status, e.code, e.message, e.details ?? {});
    if (e instanceof ZodError) return err(400, "validation", "Invalid input", { issues: e.issues });
    console.error("public api", e);
    return err(500, "internal", "Internal error");
  }
}

/** Housekeeping for the daily job: remembered idempotency keys older than a day. */
export async function purgeIdempotency(now = new Date()): Promise<number> {
  return (await db.apiIdempotency.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - IDEMPOTENCY_TTL_MS) } } })).count;
}
