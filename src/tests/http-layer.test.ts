import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("@/server/auth", () => ({ auth: async () => (session.user ? { user: session.user } : null) }));

import { ApiError } from "@/server/http/errors";
import { json, parseBody, route } from "@/server/http/handler";
import { clientIp, readJson, readText } from "@/server/http/limits";
import { resetRateLimits } from "@/server/http/rate-limit";

const req = (body?: BodyInit | null, init: RequestInit = {}, ip?: string) => new NextRequest("http://localhost/api/x", { method: "POST", body, headers: { ...(ip ? { "x-forwarded-for": ip } : {}), ...(init.headers as Record<string, string>) } });
const ctx = { params: Promise.resolve({}) };

beforeEach(() => {
  resetRateLimits();
  session.user = { id: "u1" };
});

describe("the route wrapper", () => {
  it("refuses callers without a session before running anything", async () => {
    session.user = null;
    const run = vi.fn(async () => ({ ok: true }));
    const res = await route({}, run)(req(), ctx);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "unauthorized" } });
    expect(run).not.toHaveBeenCalled();
  });

  it("passes the user id and params to the handler, and turns null into 204", async () => {
    const res = await route<{ id: string }>({}, async ({ userId, params }) => ({ userId, id: params.id }))(req(), { params: Promise.resolve({ id: "n1" }) });
    expect(await res.json()).toEqual({ userId: "u1", id: "n1" });
    expect((await route({}, async () => null)(req(), ctx)).status).toBe(204);
    expect((await route({}, async () => json({ made: true }, 201))(req(), ctx)).status).toBe(201);
  });

  it("maps errors to the documented shape and hides unexpected ones", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const api = await route({}, async () => Promise.reject(new ApiError(409, "conflict_x", "Nope", { extra: 1 })))(req(), ctx);
    expect([api.status, await api.json()]).toEqual([409, { error: { code: "conflict_x", message: "Nope", extra: 1 } }]);
    const bad = await route({}, async ({ req: r }) => parseBody(r, z.object({ n: z.number() })))(req(JSON.stringify({ n: "x" })), ctx);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("validation");
    const boom = await route({}, async () => Promise.reject(new Error("secret db password in message")))(req(), ctx);
    expect(boom.status).toBe(500);
    expect(JSON.stringify(await boom.json())).not.toContain("secret");
    log.mockRestore();
  });

  it("limits requests per route and caller address", async () => {
    const r = route({ rateLimit: { limit: 2, windowMs: 60_000 } }, async () => ({ ok: true }));
    expect([(await r(req(null, {}, "1.1.1.1"), ctx)).status, (await r(req(null, {}, "1.1.1.1"), ctx)).status, (await r(req(null, {}, "1.1.1.1"), ctx)).status]).toEqual([200, 200, 429]);
    expect((await r(req(null, {}, "2.2.2.2"), ctx)).status).toBe(200); // another caller is unaffected
  });
});

describe("who the caller is", () => {
  const h = (xff?: string) => new Headers(xff ? { "x-forwarded-for": xff } : {});
  it("trusts only what our own proxy appended, never what the client sent first", () => {
    expect(clientIp(h("9.9.9.9"))).toBe("9.9.9.9");
    expect(clientIp(h("6.6.6.6, 9.9.9.9"))).toBe("9.9.9.9"); // the client made up the first entry
    expect(clientIp(h("6.6.6.6, 7.7.7.7, 9.9.9.9"), 2)).toBe("7.7.7.7");
    expect(clientIp(h("9.9.9.9"), 5)).toBe("9.9.9.9");
    expect(clientIp(h())).toBe("local");
    expect(clientIp(h(" , "))).toBe("local");
  });

  it("cannot be dodged by forging the header: the limit follows the real address", async () => {
    const r = route({ rateLimit: { limit: 1, windowMs: 60_000 } }, async () => ({}));
    expect((await r(req(null, {}, "1.1.1.1, 9.9.9.9"), ctx)).status).toBe(200);
    expect((await r(req(null, {}, "2.2.2.2, 9.9.9.9"), ctx)).status).toBe(429);
  });
});

describe("body limits", () => {
  it("reads normal bodies and rejects bad JSON", async () => {
    expect(await readJson(req(JSON.stringify({ a: 1 })))).toEqual({ a: 1 });
    expect(await readText(req("héllo"))).toBe("héllo");
    await expect(readJson(req("{nope"))).rejects.toMatchObject({ status: 400, code: "invalid_json" });
    await expect(readJson(req(null))).rejects.toMatchObject({ status: 400 });
  });

  it("stops reading at the limit, whether or not Content-Length told the truth", async () => {
    const big = JSON.stringify({ pad: "x".repeat(5000) });
    await expect(readJson(req(big), 1000)).rejects.toMatchObject({ status: 413, code: "payload_too_large" });
    const lying = new NextRequest("http://localhost/x", { method: "POST", body: big, headers: { "content-length": "10" } });
    await expect(readJson(lying, 1000)).rejects.toMatchObject({ status: 413 });
    const chunked = new Request("http://localhost/x", { method: "POST", body: new ReadableStream({ start(c) { for (let i = 0; i < 10; i++) c.enqueue(new TextEncoder().encode("y".repeat(500))); c.close(); } }), duplex: "half" } as RequestInit);
    await expect(readText(chunked, 1000)).rejects.toMatchObject({ status: 413 });
  });

  it("applies to every parsed body", async () => {
    const huge = JSON.stringify({ title: "t".repeat(1_100_000) });
    await expect(route({}, async ({ req: r }) => parseBody(r, z.object({ title: z.string() })))(req(huge), ctx).then((r) => r.status)).resolves.toBe(413);
  });
});

// ── nothing public by accident ─────────────────────────────────────────────

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? routeFiles(p) : f === "route.ts" ? [p] : [];
  });
}

/** Every route that does not use the authenticated wrapper, and what protects it instead. Adding one here is a decision. */
const OWN_PROTECTION: Record<string, string> = {
  "api/auth/[...nextauth]/route.ts": "Auth.js; sign-in POSTs are rate limited",
  "api/billing/webhook/route.ts": "Stripe signature",
  "api/demo/login/route.ts": "404 unless DEMO_MODE; rate limited; only the shared sample workspace",
  "api/signin-confirm/route.ts": "only forwards to the Auth.js e-mail callback; checks the target",
  "api/health/route.ts": "reveals only up/down",
  "api/inngest/route.ts": "Inngest signing key",
  "api/jobs/[name]/route.ts": "CRON_SECRET bearer, off when unset",
  "api/integrations/google/callback/route.ts": "signed state bound to the signed-in user",
  "api/integrations/google/webhook/route.ts": "channel token",
  "api/integrations/slack/callback/route.ts": "signed state bound to the signed-in user",
  "api/integrations/slack/events/route.ts": "Slack signature",
  "api/integrations/telegram/webhook/route.ts": "secret token header",
  "api/public/forms/[key]/route.ts": "public form key, rate limited",
  "api/public/hooks/leads/route.ts": "bearer token (hashed), rate limited",
  "api/public/leads/[key]/route.ts": "public form key, rate limited",
  "api/public/v1/[[...path]]/route.ts": "API token in the dispatcher",
  "api/realtime/stream/route.ts": "session checked inside",
};
/** Routes that opt out of the session check on purpose. */
const NO_SESSION = ["api/v1/invitations/[token]/route.ts"];

describe("route inventory", () => {
  const root = join(process.cwd(), "src", "app");
  const files = routeFiles(join(root, "api")).map((f) => relative(root, f).replace(/\\/g, "/"));

  it("finds the routes", () => expect(files.length).toBeGreaterThan(100));

  it("lets nothing through without the session wrapper unless it is on the reviewed list", () => {
    const unwrapped = files.filter((f) => !/\broute(<[^>]*>)?\(/.test(readFileSync(join(root, f), "utf8")));
    expect(unwrapped.sort()).toEqual(Object.keys(OWN_PROTECTION).sort());
  });

  it("allows `auth: false` only where reviewed", () => {
    const open = files.filter((f) => /auth:\s*false/.test(readFileSync(join(root, f), "utf8")));
    expect(open).toEqual(NO_SESSION);
  });

  it("checks a signature or token in every webhook", () => {
    for (const f of ["api/billing/webhook/route.ts", "api/integrations/slack/events/route.ts", "api/integrations/telegram/webhook/route.ts", "api/integrations/google/webhook/route.ts"]) expect(readFileSync(join(root, f), "utf8"), f).toMatch(/verify\w*|handleGoogleWebhook/);
  });
});
