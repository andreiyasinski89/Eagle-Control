import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

vi.hoisted(() => {
  Object.assign(process.env, { DATABASE_URL: "postgresql://x", AUTH_SECRET: "test-auth-secret", APP_URL: "https://app.example.test", SECRETS_KEY: Buffer.alloc(32, 9).toString("base64") });
});
const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn(async () => undefined) }));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { createNode, createProject, transact } from "@/server/services/nodes/ops";
import { getTree } from "@/server/services/nodes/queries";
import { createDeal, winDeal } from "@/server/services/crm/deals";
import { resetRateLimits } from "@/server/http/rate-limit";
import { createToken, listTokens, revokeToken } from "@/server/public-api/tokens";
import { dispatch, purgeIdempotency, RATE_LIMIT } from "@/server/public-api/dispatch";
import { openApiDocument } from "@/server/public-api/openapi";
import { endpoints } from "@/server/public-api/endpoints";
import { assertPublicUrl, BACKOFF_MS, createEndpoint, deliverDue, emit, isPrivateAddress, listEndpoints, resolver, sendTest, sign } from "@/server/webhooks";
import { decryptSecret } from "@/lib/crypto";

let close: () => Promise<void>;
let owner: string;
let member: string;
let guest: string;
let ws: { id: string; slug: string };
let other: { id: string };
let projectId: string;
let otherProjectId: string;
let sprintId: string;
let freeWs: { id: string };
let readTok: string;
let writeTok: string;

const call = async (token: string | null, method: string, path: string, body?: unknown, extra: Record<string, string> = {}) => {
  const [p, q = ""] = path.split("?");
  const headers = new Headers({ ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra });
  return dispatch(method, p as string, new URLSearchParams(q), headers, async () => body);
};
// The database stamps rows a few milliseconds after this process reads its clock; "now" for delivery tests is a moment later.
const soon = () => new Date(Date.now() + 2000);
const data = (r: { body: unknown }) => (r.body as { data: Record<string, unknown> }).data;

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  member = (await t.db.user.create({ data: { email: "m@x.io" } })).id;
  guest = (await t.db.user.create({ data: { email: "g@x.io" } })).id;
  ws = await createWorkspace(owner, "Api Co");
  other = await createWorkspace(owner, "Other Co");
  freeWs = await createWorkspace(owner, "Free Co");
  await t.db.workspace.updateMany({ where: { id: { in: [ws.id, other.id] } }, data: { plan: "PRO" } });
  await t.db.membership.create({ data: { userId: member, workspaceId: ws.id, role: "MEMBER", crmAccess: false } });
  await t.db.membership.create({ data: { userId: guest, workspaceId: ws.id, role: "GUEST" } });
  projectId = (await createProject(owner, ws.id, { name: "Mine", template: "agile-sprint-map" })).project.id;
  otherProjectId = (await createProject(owner, other.id, { name: "Elsewhere" })).project.id;
  sprintId = (await getTree(owner, projectId)).nodes.find((n) => n.type === "SPRINT")!.id;
  readTok = (await createToken(owner, ws.id, { name: "reader", scope: "read", expiresInDays: 30 })).token;
  writeTok = (await createToken(owner, ws.id, { name: "writer", scope: "write", expiresInDays: null })).token;
}, 120_000);
afterAll(async () => close?.());
beforeEach(() => resetRateLimits());

describe("tokens", () => {
  it("shows the secret once and stores only a hash and a prefix", async () => {
    const t = await createToken(owner, ws.id, { name: "once", scope: "read", expiresInDays: 1 });
    expect(t.token).toMatch(/^mo_/);
    const row = await holder.db.apiToken.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.tokenHash).not.toContain(t.token);
    expect(row.prefix).toBe(t.token.slice(0, 10));
    expect(JSON.stringify(await listTokens(owner, ws.id))).not.toContain(t.token);
  });

  it("is only for paying workspaces and for people who are not guests or clients", async () => {
    await expect(createToken(owner, freeWs.id, { name: "x", scope: "read", expiresInDays: 1 })).rejects.toMatchObject({ status: 402, code: "plan_feature" });
    await expect(createToken(guest, ws.id, { name: "x", scope: "read", expiresInDays: 1 })).rejects.toMatchObject({ status: 403 });
  });

  it("rejects missing, malformed, revoked, expired and orphaned tokens alike", async () => {
    expect((await call(null, "GET", "/projects")).status).toBe(401);
    expect((await call("mo_nope", "GET", "/projects")).status).toBe(401);
    expect((await call("not-a-token", "GET", "/projects")).status).toBe(401);
    const t = await createToken(member, ws.id, { name: "m", scope: "read", expiresInDays: 1 });
    expect((await call(t.token, "GET", "/projects")).status).toBe(200);
    await expect(revokeToken(guest, t.id)).rejects.toMatchObject({ status: 403 });
    await revokeToken(member, t.id);
    expect((await call(t.token, "GET", "/projects")).status).toBe(401);
    const short = await createToken(member, ws.id, { name: "s", scope: "read", expiresInDays: 1 });
    await holder.db.apiToken.update({ where: { id: short.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await call(short.token, "GET", "/projects")).status).toBe(401);
    const orphan = await createToken(member, ws.id, { name: "o", scope: "read", expiresInDays: 1 });
    await holder.db.membership.update({ where: { userId_workspaceId: { userId: member, workspaceId: ws.id } }, data: { role: "GUEST" } });
    expect((await call(orphan.token, "GET", "/projects")).status).toBe(401); // demoted: the token dies with the rights
    await holder.db.membership.update({ where: { userId_workspaceId: { userId: member, workspaceId: ws.id } }, data: { role: "MEMBER" } });
  });

  it("stops working when the workspace leaves the Pro plan", async () => {
    await holder.db.workspace.update({ where: { id: ws.id }, data: { plan: "FREE" } });
    expect((await call(readTok, "GET", "/projects")).status).toBe(402);
    await holder.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  });
});

describe("reading", () => {
  it("lists projects with cursor pagination", async () => {
    await createProject(owner, ws.id, { name: "Second" });
    await createProject(owner, ws.id, { name: "Third" });
    const first = await call(readTok, "GET", "/projects?limit=2");
    const b1 = first.body as { items: { title: string }[]; nextCursor: string | null };
    expect(first.status).toBe(200);
    expect(b1.items).toHaveLength(2);
    expect(first.headers["x-ratelimit-limit"]).toBe(String(RATE_LIMIT));
    const second = await call(readTok, "GET", `/projects?cursor=${b1.nextCursor}`);
    const b2 = second.body as { items: { title: string }[]; nextCursor: string | null };
    expect(b2.items).toHaveLength(1);
    expect(b2.nextCursor).toBeNull();
    expect([...b1.items, ...b2.items].map((p) => p.title).sort()).toEqual(["Mine", "Second", "Third"]);
    expect((await call(readTok, "GET", "/projects?cursor=garbage")).status).toBe(400);
  });

  it("syncs changes with updatedSince, oldest first", async () => {
    const before = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 20));
    const t = (await transact(owner, (ctx) => createNode(ctx, { parentId: sprintId, type: "TASK", title: "New since" }))).result;
    const r = await call(readTok, "GET", `/nodes?projectId=${projectId}&updatedSince=${encodeURIComponent(before)}`);
    const titles = (r.body as { items: { title: string }[] }).items.map((n) => n.title);
    expect(titles).toContain("New since");
    expect(titles.length).toBeLessThan(8);
    expect(data(await call(readTok, "GET", `/nodes/${t.id}`)).node).toMatchObject({ title: "New since" });
    expect((await call(readTok, "GET", "/nodes")).status).toBe(400); // projectId is required
  });
});

describe("workspace isolation", () => {
  it("makes anything in another workspace look nonexistent, even for a person who belongs to both", async () => {
    expect((await call(readTok, "GET", `/projects/${otherProjectId}`)).status).toBe(404);
    expect((await call(readTok, "GET", `/nodes/${otherProjectId}`)).status).toBe(404);
    expect((await call(readTok, "GET", `/nodes?projectId=${otherProjectId}`)).status).toBe(404);
    expect((await call(writeTok, "POST", "/nodes", { parentId: otherProjectId, type: "EPIC", title: "Sneaky" })).status).toBe(404);
    expect((await call(writeTok, "PATCH", `/nodes/${otherProjectId}`, { title: "Hijack" })).status).toBe(404);
    expect((await holder.db.node.findUniqueOrThrow({ where: { id: otherProjectId } })).title).toBe("Elsewhere");
  });
});

describe("writing", () => {
  it("needs a write token, validates input and leaves an audit entry", async () => {
    const denied = await call(readTok, "POST", "/nodes", { parentId: sprintId, type: "TASK", title: "x" });
    expect(denied).toMatchObject({ status: 403, body: { error: { code: "insufficient_scope" } } });
    expect((await call(writeTok, "POST", "/nodes", { parentId: sprintId, type: "TASK" })).status).toBe(400);
    expect((await call(writeTok, "POST", "/nodes", { type: "EPIC", title: "No parent" })).status).toBe(400);
    const ok = await call(writeTok, "POST", "/nodes", { parentId: sprintId, type: "TASK", title: "From the API" });
    expect(ok.status).toBe(201);
    const id = String(data(ok).id);
    expect(data(await call(writeTok, "PATCH", `/nodes/${id}`, { status: "IN_PROGRESS" })).status).toBe("IN_PROGRESS");
    expect((await call(writeTok, "DELETE", `/nodes/${id}`)).status).toBe(200);
    expect(await holder.db.activityLog.count({ where: { workspaceId: ws.id, action: "api.write" } })).toBeGreaterThanOrEqual(3);
  });

  it("answers a repeated POST with the first response", async () => {
    const a = await call(writeTok, "POST", "/nodes", { parentId: sprintId, type: "TASK", title: "Once" }, { "idempotency-key": "k-1" });
    const b = await call(writeTok, "POST", "/nodes", { parentId: sprintId, type: "TASK", title: "Once" }, { "idempotency-key": "k-1" });
    expect(b.headers["idempotent-replayed"]).toBe("true");
    expect(data(b).id).toBe(data(a).id);
    expect(await holder.db.node.count({ where: { title: "Once", parentId: sprintId } })).toBe(1);
    expect(await purgeIdempotency(new Date(Date.now() + 2 * 86_400_000))).toBeGreaterThan(0);
  });

  it("logs time as the token's owner and comments on nodes", async () => {
    const task = String(data(await call(writeTok, "POST", "/nodes", { parentId: sprintId, type: "TASK", title: "Timed" })).id);
    const e = await call(writeTok, "POST", `/nodes/${task}/time`, { minutes: 45, date: new Date().toISOString().slice(0, 10), billable: true });
    expect(e.status).toBe(201);
    expect(data(e)).toMatchObject({ minutes: 45, userName: "Owner" });
    const c = await call(writeTok, "POST", `/nodes/${task}/comments`, { body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }] }, mentions: [], parentCommentId: null });
    expect(c.status).toBe(201);
    expect((data(await call(readTok, "GET", `/nodes/${task}/comments`)) as unknown as unknown[]).length).toBe(1);
  });

  it("covers CRM only for people with CRM access", async () => {
    const mine = await createToken(member, ws.id, { name: "crm?", scope: "write", expiresInDays: 1 });
    expect((await call(mine.token, "GET", "/contacts")).status).toBe(403);
    const c = await call(writeTok, "POST", "/contacts", { firstName: "Ann", lastName: "Lee", emails: ["ann@client.io"], phones: [], messengers: {} });
    expect(c.status).toBe(201);
    const list = (await call(writeTok, "GET", "/contacts?q=ann")).body as { items: { name: string }[]; total: number };
    expect(list.items.map((i) => i.name)).toEqual(["Ann Lee"]);
    const co = String(data(await call(writeTok, "POST", "/companies", { legalName: "Client Ltd" })).id);
    expect(data(await call(writeTok, "GET", `/companies/${co}`)).legalName ?? data(await call(writeTok, "GET", `/companies/${co}`))).toBeTruthy();
    const d = await call(writeTok, "POST", "/deals", { title: "API deal", amount: 10, currency: "EUR", companyId: co });
    expect(d.status).toBe(201);
    const stages = (await holder.db.pipelineStage.findMany({ orderBy: { order: "asc" }, where: { pipeline: { workspaceId: ws.id } } }));
    expect((await call(writeTok, "POST", `/deals/${data(d).id}/move`, { stageId: stages[1]!.id })).status).toBe(200);
    expect((await call(writeTok, "GET", "/activities")).status).toBe(200);
  });
});

describe("limits and errors", () => {
  it("rate limits per token with Retry-After", async () => {
    for (let i = 0; i < RATE_LIMIT; i++) await call(readTok, "GET", "/projects?limit=1");
    const r = await call(readTok, "GET", "/projects");
    expect(r).toMatchObject({ status: 429 });
    expect(r.headers["retry-after"]).toBeTruthy();
    expect((await call(writeTok, "GET", "/projects")).status).toBe(200); // another token is unaffected
  }, 60_000); // hundreds of authenticated calls against an in-process database

  it("distinguishes unknown paths from wrong methods", async () => {
    expect((await call(readTok, "GET", "/nothing")).status).toBe(404);
    expect((await call(readTok, "GET", "/projects/a/b/c")).status).toBe(404);
    expect((await call(readTok, "PUT", "/projects")).status).toBe(405);
    expect((await call(writeTok, "DELETE", "/projects")).status).toBe(405);
  });
});

describe("OpenAPI document", () => {
  it("describes every endpoint of the dispatcher with scopes and schemas", () => {
    const doc = openApiDocument("https://app.example.test");
    expect(doc.servers[0]!.url).toBe("https://app.example.test/api/public/v1");
    const ops = Object.values(doc.paths).flatMap((p) => Object.keys(p));
    expect(ops).toHaveLength(endpoints.length);
    const post = doc.paths["/nodes"]!.post as { requestBody: { content: { "application/json": { schema: { properties: Record<string, unknown> } } } }; "x-scope": string };
    expect(post["x-scope"]).toBe("write");
    expect(Object.keys(post.requestBody.content["application/json"].schema.properties)).toContain("title");
    expect((doc.paths["/nodes/{id}"]!.get as { parameters: { name: string; in: string }[] }).parameters[0]).toMatchObject({ name: "id", in: "path" });
    expect((doc.paths["/projects"]!.get as { parameters: { name: string }[] }).parameters.map((p) => p.name)).toEqual(expect.arrayContaining(["limit", "cursor"]));
  });
});

// ── outgoing webhooks ──────────────────────────────────────────────────────

describe("webhooks", () => {
  const sent: { url: string; headers: Record<string, string>; body: string }[] = [];
  let respond: () => Response = () => new Response("ok");
  const fake = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input), headers: init?.headers as Record<string, string>, body: String(init?.body) });
    return respond();
  });
  beforeEach(() => {
    sent.length = 0;
    respond = () => new Response("ok");
    vi.stubGlobal("fetch", fake);
    resolver.resolve = async () => ["93.184.216.34"];
  });
  afterEach(() => vi.unstubAllGlobals());

  it("refuses addresses that point into our own network", async () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::1"]) expect(isPrivateAddress(ip), ip).toBe(false);
    await expect(assertPublicUrl("http://example.com/h")).rejects.toMatchObject({ code: "https_required" });
    await expect(assertPublicUrl("https://localhost/h")).rejects.toMatchObject({ code: "private_url" });
    await expect(assertPublicUrl("https://169.254.169.254/latest")).rejects.toMatchObject({ code: "private_url" });
    await expect(assertPublicUrl("https://user:pw@example.com/h")).rejects.toMatchObject({ code: "invalid_url" });
    resolver.resolve = async () => ["10.0.0.5"];
    await expect(assertPublicUrl("https://sneaky.example.com/h")).rejects.toMatchObject({ code: "private_url" }); // a public name that resolves to a private address
    resolver.resolve = async () => [];
    await expect(assertPublicUrl("https://nxdomain.example.com/h")).rejects.toMatchObject({ code: "unresolvable_url" });
  });

  it("registers an endpoint (admins, Pro) and shows the secret only once", async () => {
    await expect(createEndpoint(member, ws.id, { url: "https://hooks.example.com/a", events: ["lead.created"] })).rejects.toMatchObject({ status: 403 });
    const e = await createEndpoint(owner, ws.id, { url: "https://hooks.example.com/a", events: ["deal.won", "lead.created", "deal.won"] });
    expect(e.secret).toMatch(/^whsec_/);
    expect(e.events).toEqual(["deal.won", "lead.created"]);
    expect(JSON.stringify(await listEndpoints(owner, ws.id))).not.toContain(e.secret);
    const row = await holder.db.webhookEndpoint.findUniqueOrThrow({ where: { id: e.id } });
    expect(row.secretEnc).not.toContain(e.secret);
    expect(decryptSecret(row.secretEnc)).toBe(e.secret);
    await expect(createEndpoint(owner, freeWs.id, { url: "https://hooks.example.com/a", events: ["deal.won"] })).rejects.toMatchObject({ status: 402 });
  });

  it("delivers a signed event when a deal is won, and only to subscribers", async () => {
    await holder.db.webhookEndpoint.deleteMany({});
    const won = await createEndpoint(owner, ws.id, { url: "https://hooks.example.com/won", events: ["deal.won"] });
    await createEndpoint(owner, ws.id, { url: "https://hooks.example.com/leads", events: ["lead.created"] });
    const deal = await createDeal(owner, ws.id, { title: "Webhook deal", amount: 5, currency: "EUR" });
    await winDeal(owner, deal.id);
    expect(await deliverDue(soon())).toMatchObject({ delivered: 1 });
    expect(sent).toHaveLength(1);
    const d = sent[0]!;
    expect(d.url).toBe("https://hooks.example.com/won");
    const payload = JSON.parse(d.body) as { event: string; workspaceId: string; data: { dealId: string; title: string } };
    expect(payload).toMatchObject({ event: "deal.won", workspaceId: ws.id, data: { dealId: deal.id, title: "Webhook deal" } });
    const [t, v1] = d.headers["meetowl-signature"]!.split(",").map((p) => p.split("=")[1]) as [string, string];
    expect(v1).toBe(createHmac("sha256", won.secret).update(`${t}.${d.body}`).digest("hex"));
    expect(d.headers["meetowl-event"]).toBe("deal.won");
  });

  it("coalesces bursts of project changes into one pending delivery", async () => {
    await holder.db.webhookEndpoint.deleteMany({});
    await createEndpoint(owner, ws.id, { url: "https://hooks.example.com/p", events: ["project.changed"] });
    for (let i = 0; i < 3; i++) await transact(owner, (ctx) => createNode(ctx, { parentId: sprintId, type: "TASK", title: `Burst ${i}` }));
    await new Promise((r) => setTimeout(r, 150));
    expect(await holder.db.webhookDelivery.count({ where: { status: "pending", event: "project.changed" } })).toBe(1);
    await deliverDue(soon());
    expect(JSON.parse(sent[0]!.body).data.projectId).toBe(projectId);
  });

  it("retries with backoff, gives up after the last attempt, and does not follow redirects", async () => {
    await holder.db.webhookEndpoint.deleteMany({});
    const e = await createEndpoint(owner, ws.id, { url: "https://hooks.example.com/flaky", events: ["lead.created"] });
    await emit(ws.id, "lead.created", { dealId: "d1" });
    respond = () => new Response("nope", { status: 500 });
    const start = soon();
    expect(await deliverDue(start)).toMatchObject({ retried: 1 });
    let row = await holder.db.webhookDelivery.findFirstOrThrow({ where: { endpointId: e.id } });
    expect(row).toMatchObject({ attempts: 1, status: "pending", lastError: "HTTP 500" });
    expect(row.nextAttemptAt.getTime()).toBe(start.getTime() + BACKOFF_MS[0]!);
    expect(await deliverDue(new Date(start.getTime() + 1000))).toMatchObject({ delivered: 0, retried: 0 }); // not due yet
    let now = start.getTime();
    for (let i = 1; i < BACKOFF_MS.length; i++) {
      now += BACKOFF_MS[i - 1]! + 1;
      await deliverDue(new Date(now));
    }
    now += BACKOFF_MS.at(-1)! + 1;
    expect(await deliverDue(new Date(now))).toMatchObject({ failed: 1 });
    row = await holder.db.webhookDelivery.findFirstOrThrow({ where: { endpointId: e.id } });
    expect(row).toMatchObject({ status: "failed", attempts: BACKOFF_MS.length + 1 });
    respond = () => new Response(null, { status: 302, headers: { location: "https://169.254.169.254/" } });
    await emit(ws.id, "lead.created", { dealId: "d2" });
    expect(await deliverDue(soon())).toMatchObject({ retried: 1 });
    expect(sent.at(-1)!.url).toBe("https://hooks.example.com/flaky");
  });

  it("checks the address again at delivery time and can send a test ping", async () => {
    await holder.db.webhookEndpoint.deleteMany({});
    const e = await createEndpoint(owner, ws.id, { url: "https://rebind.example.com/h", events: ["lead.created"] });
    expect(await sendTest(owner, e.id)).toMatchObject({ delivered: 1 });
    expect(JSON.parse(sent[0]!.body)).toMatchObject({ event: "ping" });
    resolver.resolve = async () => ["10.0.0.9"]; // DNS changed after the endpoint was saved
    sent.length = 0;
    await emit(ws.id, "lead.created", { dealId: "d3" });
    expect(await deliverDue(soon())).toMatchObject({ retried: 1 });
    expect(sent).toHaveLength(0);
    void sign;
  });
});
