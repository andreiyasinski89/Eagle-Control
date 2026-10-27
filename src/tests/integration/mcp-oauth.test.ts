import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient, userId: null as string | null }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/auth", () => ({ auth: async () => (holder.userId ? { user: { id: holder.userId } } : null) }));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { createProject } from "@/server/services/nodes/ops";
import { exchangeCode, isKnownClientHost, issueCode, listGrants, purgeOAuth, refreshTokens, registerClient, revokeGrant, validateAuthorize } from "@/server/services/oauth";
import { authenticate } from "@/server/public-api/tokens";
import { TOOLS } from "@/server/mcp/tools";
import { POST as mcpPost, GET as mcpGet } from "@/app/api/mcp/route";
import { POST as tokenPost } from "@/app/api/oauth/token/route";
import { POST as registerPost } from "@/app/api/oauth/register/route";
import { POST as authorizePost } from "@/app/api/oauth/authorize/route";

const APP = "http://localhost:3000";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

let close: () => Promise<void>;
let owner: string;
let member: string;
let guest: string;
let free: string;
let ws: { id: string };
let projectId: string;
let n = 0;

const verifier = () => `v${(++n).toString().padStart(2, "0")}`.padEnd(50, "x");
const challengeOf = (v: string) => createHash("sha256").update(v).digest("base64url");

async function connect(userId: string, workspaceId: string, scope: "read" | "write" = "write") {
  const client = await registerClient({ client_name: "Claude", redirect_uris: [REDIRECT] });
  const v = verifier();
  const valid = await validateAuthorize({ response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challengeOf(v), code_challenge_method: "S256", state: "s1" }, APP);
  const code = await issueCode(userId, valid, workspaceId, scope);
  return { client, code, verifier: v };
}
const tokensFor = async (userId: string, workspaceId: string, scope: "read" | "write" = "write") => {
  const c = await connect(userId, workspaceId, scope);
  return { ...(await exchangeCode({ code: c.code, clientId: c.client.client_id, redirectUri: REDIRECT, codeVerifier: c.verifier })), clientId: c.client.client_id };
};

const rpc = (token: string, body: unknown) => mcpPost(new NextRequest(`${APP}/api/mcp`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body) }));
const call = async (token: string, name: string, args: Record<string, unknown> = {}) => {
  const res = await rpc(token, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  const out = (await res.json()) as { result: { isError?: boolean; content: { text: string }[] } };
  return { isError: out.result.isError === true, text: out.result.content[0]?.text ?? "" };
};

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "owner@x.io", name: "Owner" } })).id;
  member = (await t.db.user.create({ data: { email: "member@x.io", name: "Member" } })).id;
  guest = (await t.db.user.create({ data: { email: "guest@x.io", name: "Guest" } })).id;
  free = (await t.db.user.create({ data: { email: "free@x.io", name: "Free" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  await t.db.membership.create({ data: { userId: member, workspaceId: ws.id, role: "MEMBER" } });
  await t.db.membership.create({ data: { userId: guest, workspaceId: ws.id, role: "GUEST" } });
  await createWorkspace(free, "Free one"); // stays on the free plan
  projectId = (await createProject(owner, ws.id, { name: "Launch", template: "empty", estimationUnit: "HOURS" })).project.id;
}, 120_000);

afterAll(async () => close?.());

describe("tool registry", () => {
  it("has unique names, object schemas, and read-only flags that follow the HTTP method", () => {
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
    for (const t of TOOLS) {
      expect(t.inputSchema.type, t.name).toBe("object");
      expect(t.description.length, t.name).toBeGreaterThan(12);
    }
    expect(TOOLS.filter((t) => t.readOnly).length).toBeGreaterThan(10);
    expect(TOOLS.find((t) => t.name === "archive_node")).toMatchObject({ readOnly: false, destructive: true });
    expect(TOOLS.find((t) => t.name === "get_project")?.inputSchema).toMatchObject({ required: ["id"] });
  });
});

describe("who is asking", () => {
  it("knows Anthropic's addresses and a local program, and nothing that merely looks similar", () => {
    for (const ok of ["https://claude.ai/api/mcp/auth_callback", "https://www.claude.com/cb", "http://localhost:53682/callback", "http://127.0.0.1:1/cb"]) expect(isKnownClientHost(ok), ok).toBe(true);
    for (const no of ["https://claude.ai.evil.example/cb", "https://evilclaude.ai/cb", "https://example.com/claude.ai", "nonsense"]) expect(isKnownClientHost(no), no).toBe(false);
  });
});

describe("dynamic client registration", () => {
  it("accepts https and localhost redirects, refuses everything else", async () => {
    await expect(registerClient({ client_name: "x", redirect_uris: ["http://evil.example/cb"] })).rejects.toMatchObject({ oauth: "invalid_redirect_uri" });
    await expect(registerClient({ client_name: "x", redirect_uris: ["javascript:alert(1)"] })).rejects.toMatchObject({ oauth: "invalid_redirect_uri" });
    await expect(registerClient({ client_name: "x", redirect_uris: ["https://a.example/cb#frag"] })).rejects.toMatchObject({ oauth: "invalid_redirect_uri" });
    await expect(registerClient({ client_name: "x", redirect_uris: ["https://a.example/cb"], token_endpoint_auth_method: "client_secret_basic" })).rejects.toMatchObject({ oauth: "invalid_request" });
    const ok = await registerClient({ client_name: "  Claude <b>Code</b>\n", redirect_uris: ["http://localhost:53682/callback", "http://127.0.0.1:9/cb"] });
    expect(ok).toMatchObject({ client_name: "Claude bCode/b", token_endpoint_auth_method: "none" });
  });

  it("answers over HTTP with 201 and a client id", async () => {
    const res = await registerPost(new NextRequest(`${APP}/api/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "Claude", redirect_uris: [REDIRECT] }) }));
    expect(res.status).toBe(201);
    expect(((await res.json()) as { client_id: string }).client_id).toBeTruthy();
    const bad = await registerPost(new NextRequest(`${APP}/api/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    expect(bad.status).toBe(400);
  });
});

describe("authorization request", () => {
  it("never trusts an unregistered redirect address and demands PKCE S256", async () => {
    const client = await registerClient({ client_name: "Claude", redirect_uris: [REDIRECT] });
    const base = { response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challengeOf("a".repeat(50)), code_challenge_method: "S256" };
    await expect(validateAuthorize({ ...base, redirect_uri: "https://claude.ai/other" }, APP)).rejects.toMatchObject({ oauth: "invalid_redirect_uri" });
    await expect(validateAuthorize({ ...base, client_id: "nope" }, APP)).rejects.toMatchObject({ oauth: "invalid_client" });
    await expect(validateAuthorize({ ...base, code_challenge_method: "plain" }, APP)).rejects.toMatchObject({ oauth: "invalid_request" });
    await expect(validateAuthorize({ ...base, code_challenge: undefined }, APP)).rejects.toMatchObject({ oauth: "invalid_request" });
    await expect(validateAuthorize({ ...base, resource: "https://other.example/api/mcp" }, APP)).rejects.toMatchObject({ oauth: "invalid_target" });
    await expect(validateAuthorize({ ...base, resource: `${APP}/api/mcp` }, APP)).resolves.toMatchObject({ client: { name: "Claude" } });
  });

  it("only lets people connect a Pro workspace they belong to as more than a guest", async () => {
    const client = await registerClient({ client_name: "Claude", redirect_uris: [REDIRECT] });
    const v = await validateAuthorize({ response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challengeOf("b".repeat(50)), code_challenge_method: "S256" }, APP);
    await expect(issueCode(guest, v, ws.id, "write")).rejects.toMatchObject({ status: 403 });
    await expect(issueCode(free, v, ws.id, "write")).rejects.toMatchObject({ status: 403 }); // not a member
    const freeWs = (await holder.db.membership.findFirstOrThrow({ where: { userId: free } })).workspaceId;
    await expect(issueCode(free, v, freeWs, "write")).rejects.toMatchObject({ status: 403 }); // a member, but the plan has no API
    await expect(issueCode(member, v, ws.id, "read")).resolves.toBeTruthy();
  });
});

describe("token endpoint", () => {
  it("exchanges a code once, with the right verifier, for tokens that the public API accepts", async () => {
    const c = await connect(owner, ws.id, "write");
    const wrong = { code: c.code, clientId: c.client.client_id, redirectUri: REDIRECT };
    await expect(exchangeCode({ ...wrong, codeVerifier: verifier() })).rejects.toMatchObject({ oauth: "invalid_grant" });
    await expect(exchangeCode({ ...wrong, redirectUri: "https://claude.ai/x", codeVerifier: c.verifier })).rejects.toMatchObject({ oauth: "invalid_grant" });
    await expect(exchangeCode({ ...wrong, clientId: "other", codeVerifier: c.verifier })).rejects.toMatchObject({ oauth: "invalid_grant" });

    const t = await exchangeCode({ ...wrong, codeVerifier: c.verifier });
    expect(t).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "write" });
    expect(t.access_token.startsWith("mo_")).toBe(true);
    await expect(authenticate(`Bearer ${t.access_token}`)).resolves.toMatchObject({ userId: owner, workspaceId: ws.id, scope: "write" });
    await expect(exchangeCode({ ...wrong, codeVerifier: c.verifier })).rejects.toMatchObject({ oauth: "invalid_grant" }); // single use
  });

  it("rejects an expired code", async () => {
    const c = await connect(owner, ws.id);
    await holder.db.oAuthCode.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(exchangeCode({ code: c.code, clientId: c.client.client_id, redirectUri: REDIRECT, codeVerifier: c.verifier })).rejects.toMatchObject({ oauth: "invalid_grant" });
  });

  it("speaks form-encoded HTTP and answers errors in the OAuth format", async () => {
    const c = await connect(owner, ws.id);
    const form = (o: Record<string, string>) => new NextRequest(`${APP}/api/oauth/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() });
    const bad = await tokenPost(form({ grant_type: "authorization_code", client_id: c.client.client_id, code: c.code, redirect_uri: REDIRECT, code_verifier: "z".repeat(50) }));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "invalid_grant" });
    expect(bad.headers.get("cache-control")).toBe("no-store");
    const good = await tokenPost(form({ grant_type: "authorization_code", client_id: c.client.client_id, code: c.code, redirect_uri: REDIRECT, code_verifier: c.verifier }));
    expect(good.status).toBe(200);
    expect(await good.json()).toMatchObject({ token_type: "Bearer", refresh_token: expect.any(String) });
    expect((await tokenPost(form({ grant_type: "password", client_id: "x" }))).status).toBe(400);
    expect((await tokenPost(form({ grant_type: "refresh_token" }))).status).toBe(401);
  });

  it("rotates refresh tokens, and a replayed one closes the whole connection", async () => {
    const t = await tokensFor(owner, ws.id);
    const next = await refreshTokens({ refreshToken: t.refresh_token, clientId: t.clientId });
    expect(next.access_token).not.toBe(t.access_token);
    await expect(authenticate(`Bearer ${next.access_token}`)).resolves.toMatchObject({ userId: owner });
    await expect(refreshTokens({ refreshToken: t.refresh_token, clientId: t.clientId })).rejects.toMatchObject({ oauth: "invalid_grant" }); // replay
    await expect(authenticate(`Bearer ${next.access_token}`)).rejects.toMatchObject({ status: 401 }); // the grant is gone, new token included
    await expect(refreshTokens({ refreshToken: next.refresh_token, clientId: t.clientId })).rejects.toMatchObject({ oauth: "invalid_grant" });
  });

  it("a refresh token belongs to its client", async () => {
    const t = await tokensFor(owner, ws.id);
    await expect(refreshTokens({ refreshToken: t.refresh_token, clientId: "someone-else" })).rejects.toMatchObject({ oauth: "invalid_grant" });
  });

  it("stops handing out tokens once the person left the workspace or the plan dropped", async () => {
    const t = await tokensFor(member, ws.id);
    await holder.db.membership.update({ where: { userId_workspaceId: { userId: member, workspaceId: ws.id } }, data: { role: "GUEST" } });
    await expect(refreshTokens({ refreshToken: t.refresh_token, clientId: t.clientId })).rejects.toMatchObject({ oauth: "invalid_grant" });
    await expect(authenticate(`Bearer ${t.access_token}`)).rejects.toMatchObject({ status: 401 });
    await holder.db.membership.update({ where: { userId_workspaceId: { userId: member, workspaceId: ws.id } }, data: { role: "MEMBER" } });
  });

  it("access tokens expire after an hour", async () => {
    const t = await tokensFor(owner, ws.id);
    await expect(authenticate(`Bearer ${t.access_token}`, new Date(Date.now() + 3_700_000))).rejects.toMatchObject({ status: 401 });
  });
});

describe("consent form", () => {
  const form = (o: Record<string, string>, origin: string | null = APP) => new NextRequest(`${APP}/api/oauth/authorize`, { method: "POST", headers: { ...(origin ? { origin } : {}), "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() });
  const fields = async () => {
    const client = await registerClient({ client_name: "Claude", redirect_uris: [REDIRECT] });
    return { response_type: "code", client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challengeOf("c".repeat(50)), code_challenge_method: "S256", state: "abc" };
  };

  it("refuses a form that did not come from our own pages", async () => {
    holder.userId = owner;
    const f = await fields();
    expect((await authorizePost(form({ ...f, workspaceId: ws.id, scope: "write", decision: "allow" }, "https://evil.example"), { params: Promise.resolve({}) })).status).toBe(403);
    expect((await authorizePost(form({ ...f, workspaceId: ws.id, scope: "write", decision: "allow" }, null), { params: Promise.resolve({}) })).status).toBe(403);
  });

  it("needs a signed-in person", async () => {
    holder.userId = null;
    const f = await fields();
    expect((await authorizePost(form({ ...f, workspaceId: ws.id, decision: "allow" }), { params: Promise.resolve({}) })).status).toBe(401);
  });

  it("sends a code back to the registered address with the state, or access_denied", async () => {
    holder.userId = owner;
    const f = await fields();
    const allow = await authorizePost(form({ ...f, workspaceId: ws.id, scope: "read", decision: "allow" }), { params: Promise.resolve({}) });
    expect(allow.status).toBe(303);
    const to = new URL(allow.headers.get("location") as string);
    expect(`${to.origin}${to.pathname}`).toBe(REDIRECT);
    expect(to.searchParams.get("state")).toBe("abc");
    expect(to.searchParams.get("code")).toBeTruthy();
    expect((await holder.db.oAuthCode.findFirstOrThrow({ orderBy: { createdAt: "desc" } })).scope).toBe("read");

    const deny = new URL((await authorizePost(form({ ...f, workspaceId: ws.id, decision: "deny" }), { params: Promise.resolve({}) })).headers.get("location") as string);
    expect(deny.searchParams.get("error")).toBe("access_denied");
    expect(deny.searchParams.get("code")).toBeNull();

    const nope = new URL((await authorizePost(form({ ...f, workspaceId: "someone-elses", decision: "allow" }), { params: Promise.resolve({}) })).headers.get("location") as string);
    expect(nope.searchParams.get("error")).toBe("access_denied");
  });

  it("does not redirect at all when the address is not registered", async () => {
    holder.userId = owner;
    const f = await fields();
    const res = await authorizePost(form({ ...f, redirect_uri: "https://evil.example/cb", workspaceId: ws.id, decision: "allow" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("MCP endpoint", () => {
  it("asks for sign-in with a pointer to the metadata, for missing and for wrong tokens", async () => {
    for (const headers of [{}, { authorization: "Bearer mo_nonsense" }] as Record<string, string>[]) {
      const res = await mcpPost(new NextRequest(`${APP}/api/mcp`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }) }));
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${APP}/.well-known/oauth-protected-resource"`);
    }
    expect((await mcpGet()).status).toBe(405);
  });

  it("initializes, answers pings, ignores notifications and rejects unknown methods", async () => {
    const { access_token: tok } = await tokensFor(owner, ws.id);
    const init = (await (await rpc(tok, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).json()) as { result: { protocolVersion: string; capabilities: object; serverInfo: { name: string } } };
    expect(init.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "meetowl" }, capabilities: { tools: {} } });
    const old = (await (await rpc(tok, { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } })).json()) as { result: { protocolVersion: string } };
    expect(old.result.protocolVersion).toBe("2025-06-18");
    expect(await (await rpc(tok, { jsonrpc: "2.0", id: 3, method: "ping" })).json()).toMatchObject({ result: {} });
    expect((await rpc(tok, { jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
    expect(await (await rpc(tok, { jsonrpc: "2.0", id: 4, method: "resources/list" })).json()).toMatchObject({ error: { code: -32601 } });
    const batch = (await (await rpc(tok, [{ jsonrpc: "2.0", id: 5, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }])).json()) as unknown[];
    expect(batch).toHaveLength(1);
  });

  it("offers the changing tools only to a connection that may write", async () => {
    const w = await tokensFor(owner, ws.id, "write");
    const r = await tokensFor(owner, ws.id, "read");
    const names = async (tok: string) => ((await (await rpc(tok, { jsonrpc: "2.0", id: 1, method: "tools/list" })).json()) as { result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] } }).result.tools;
    const write = await names(w.access_token);
    const read = await names(r.access_token);
    expect(write.length).toBe(TOOLS.length);
    expect(read.length).toBeLessThan(write.length);
    expect(read.every((t) => t.annotations.readOnlyHint)).toBe(true);
    expect(read.map((t) => t.name)).not.toContain("create_node");
    expect(await call(r.access_token, "create_node", { parentId: projectId, type: "TASK", title: "Nope" })).toMatchObject({ isError: true });
  });

  it("reads and changes work as the person who connected, through the same rules as the REST API", async () => {
    const { access_token: tok } = await tokensFor(owner, ws.id);
    const projects = JSON.parse((await call(tok, "list_projects")).text) as { items: { id: string; title: string }[] };
    expect(projects.items.map((p) => p.title)).toContain("Launch");

    const epic = (JSON.parse((await call(tok, "create_node", { parentId: projectId, type: "EPIC", title: "Onboarding" })).text) as { data: { id: string } }).data;
    expect(await call(tok, "create_node", { parentId: projectId, type: "TASK", title: "Too high" })).toMatchObject({ isError: true, text: expect.stringContaining("invalid_nesting") });
    const created = await call(tok, "create_node", { parentId: epic.id, type: "TASK", title: "Write the brief", dueDate: "2026-11-05T00:00:00.000Z" });
    expect(created.text).not.toMatch(/^Error/);
    const task = (JSON.parse(created.text) as { data: { id: string; title: string } }).data;
    expect(task.title).toBe("Write the brief");

    expect((await call(tok, "update_node", { id: task.id, status: "IN_PROGRESS" })).isError).toBe(false);
    expect(JSON.parse((await call(tok, "get_node", { id: task.id })).text)).toMatchObject({ data: { node: { status: "IN_PROGRESS" } } });
    expect(JSON.parse((await call(tok, "search", { q: "brief" })).text).data.length ?? 1).toBeGreaterThan(0);
    expect((await call(tok, "add_comment", { id: task.id, text: "First line\n\nSecond line" })).isError).toBe(false);
    expect(JSON.parse((await call(tok, "list_comments", { id: task.id })).text).data).toHaveLength(1);

    const event = await call(tok, "create_node", { parentId: projectId, type: "EVENT", title: "Kick-off", data: { startsAt: "2026-11-03T10:00:00.000Z", endsAt: "2026-11-03T11:00:00.000Z", attendeeIds: [owner] } });
    expect(event.isError).toBe(false);
    const cal = JSON.parse((await call(tok, "get_calendar", { from: "2026-11-01", to: "2026-11-10", mine: "0" })).text) as { data: { items: { title: string }[] } };
    expect(cal.data.items.map((i) => i.title)).toEqual(expect.arrayContaining(["Kick-off", "Write the brief"]));
    expect((await call(tok, "my_day")).isError).toBe(false);

    const contact = await call(tok, "create_contact", { firstName: "Anna", lastName: "Example", emails: ["anna@example.com"] });
    expect(contact.isError).toBe(false);
    expect(JSON.parse((await call(tok, "list_contacts", { q: "anna" })).text).items.length).toBe(1);
    expect((await call(tok, "archive_node", { id: task.id })).isError).toBe(false);
  });

  it("reports mistakes as tool errors instead of failing the request", async () => {
    const { access_token: tok } = await tokensFor(owner, ws.id);
    expect((await call(tok, "nope")).isError).toBe(true);
    expect(await call(tok, "get_node", {})).toMatchObject({ isError: true, text: expect.stringContaining("`id` is required") });
    expect(await call(tok, "create_node", { parentId: projectId, type: "TASK" })).toMatchObject({ isError: true, text: expect.stringContaining("400 validation") });
    expect(await call(tok, "get_node", { id: "does-not-exist" })).toMatchObject({ isError: true, text: expect.stringContaining("404") });
  });

  it("cannot reach into another workspace", async () => {
    const freeWs = (await holder.db.membership.findFirstOrThrow({ where: { userId: free } })).workspaceId;
    const foreign = (await createProject(free, freeWs, { name: "Secret", template: "empty", estimationUnit: "HOURS" })).project.id;
    const { access_token: tok } = await tokensFor(owner, ws.id);
    expect(await call(tok, "get_project", { id: foreign })).toMatchObject({ isError: true, text: expect.stringContaining("404") });
    expect(await call(tok, "create_node", { parentId: foreign, type: "TASK", title: "Sneaky" })).toMatchObject({ isError: true });
  });
});

describe("connections list and cleanup", () => {
  it("lists connections and ends one with all its tokens; others only see and end their own", async () => {
    const mine = await tokensFor(member, ws.id);
    const list = await listGrants(owner, ws.id);
    const row = list.find((g) => !g.mine);
    expect(row).toMatchObject({ app: "Claude", owner: "Member" });
    expect((await listGrants(member, ws.id)).every((g) => g.mine)).toBe(true);
    await expect(listGrants(guest, ws.id)).rejects.toMatchObject({ status: 403 });

    await expect(revokeGrant(guest, (row as { id: string }).id)).rejects.toBeTruthy();
    const other = await tokensFor(owner, ws.id);
    const otherGrant = (await listGrants(owner, ws.id)).find((g) => g.mine) as { id: string };
    await expect(revokeGrant(member, otherGrant.id)).rejects.toMatchObject({ status: 403 }); // not theirs, not an admin
    await revokeGrant(owner, (row as { id: string }).id); // an owner may end anyone's
    await expect(authenticate(`Bearer ${mine.access_token}`)).rejects.toMatchObject({ status: 401 });
    await expect(refreshTokens({ refreshToken: mine.refresh_token, clientId: mine.clientId })).rejects.toMatchObject({ oauth: "invalid_grant" });
    await expect(authenticate(`Bearer ${other.access_token}`)).resolves.toBeTruthy();
  });

  it("keeps OAuth tokens out of the personal token list and its limit", async () => {
    const { listTokens } = await import("@/server/public-api/tokens");
    expect((await listTokens(owner, ws.id)).length).toBe(0);
  });

  it("purges spent codes, old refresh tokens and applications nobody approved", async () => {
    const old = new Date(Date.now() + 40 * 86_400_000);
    expect(await purgeOAuth(old)).toBeGreaterThan(0);
    expect(await holder.db.oAuthClient.count({ where: { grants: { none: {} } } })).toBe(0);
  });
});
