import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/auth", () => ({ auth: async () => null }));

import { createWorkspace } from "@/server/services/workspace";
import { createLeadForm, rotateWebhookToken } from "@/server/services/crm/lead-ingest";
import { resetRateLimits } from "@/server/http/rate-limit";
import { GET as getForm } from "@/app/api/public/forms/[key]/route";
import { OPTIONS as optionsLead, POST as postLead } from "@/app/api/public/leads/[key]/route";
import { POST as postHook } from "@/app/api/public/hooks/leads/route";

let close: () => Promise<void>;
let owner: string;
let wsId: string;
let formKey: string;
let lockedKey: string;
let siteKey: string;
let token: string;

const req = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) =>
  new NextRequest(`http://localhost${url}`, { method: init.method ?? "POST", headers: init.headers, body: init.body });
const json = (headers: Record<string, string> = {}) => ({ "content-type": "application/json", ...headers });
const ctx = (key: string) => ({ params: Promise.resolve({ key }) });

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://x";
  process.env.AUTH_SECRET ??= "x";
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "owner@x.io", name: "Owner" } })).id;
  const ws = await createWorkspace(owner, "Acme");
  wsId = ws.id;
  const pipeline = await t.db.pipeline.findFirstOrThrow({ where: { workspaceId: ws.id } });
  const base = { title: "Contact", submitLabel: "Send", successMessage: "Thanks!", consentText: null, redirectUrl: null, fields: [{ key: "email" as const, label: "Email", required: true }], ownerId: owner, stageId: null };
  formKey = (await createLeadForm(owner, ws.id, { name: "Open form", pipelineId: pipeline.id, enabled: true, config: { ...base, allowedOrigins: [] } })).publicKey;
  lockedKey = (await createLeadForm(owner, ws.id, { name: "Locked form", pipelineId: pipeline.id, enabled: true, config: { ...base, allowedOrigins: ["https://client.example"] } })).publicKey;
  // An address pasted with a trailing slash, as people do, and the www variant: a browser's Origin never has a slash or a path.
  siteKey = (await createLeadForm(owner, ws.id, { name: "Site form", pipelineId: pipeline.id, enabled: true, config: { ...base, allowedOrigins: ["https://clever-travel.club/", "https://www.clever-travel.club"] } })).publicKey;
  token = (await rotateWebhookToken(owner, ws.id, { pipelineId: pipeline.id })).token;
}, 120_000);

beforeEach(() => resetRateLimits());
afterAll(async () => close?.());

describe("public form", () => {
  it("serves the definition without revealing owner, stage or workspace", async () => {
    const res = await getForm(req(`/api/public/forms/${formKey}`, { method: "GET" }), ctx(formKey));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.config.title).toBe("Contact");
    expect(JSON.stringify(body)).not.toContain(owner);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect((await getForm(req("/api/public/forms/nope", { method: "GET" }), ctx("nope"))).status).toBe(404);
  });

  it("accepts a JSON lead and creates the CRM records", async () => {
    const res = await postLead(req(`/api/public/leads/${formKey}`, { headers: json(), body: JSON.stringify({ name: "Eva Lind", email: "eva@lind.io", message: "Hi" }) }), ctx(formKey));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ok: true, message: "Thanks!", status: "created" });
    expect(await holder.db.contact.count({ where: { emails: { has: "eva@lind.io" } } })).toBe(1);
    const ingest = await holder.db.leadIngest.findFirstOrThrow({ where: { workspaceId: wsId, status: "created" } });
    expect(ingest.ipHash).toMatch(/^[0-9a-f]{24}$/); // never the raw address
  });

  it("accepts a plain HTML form post and redirects the browser back (303)", async () => {
    const res = await postLead(
      req(`/api/public/leads/${formKey}`, { headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html" }, body: "name=Ola&email=ola%40nord.io&hp=" }),
      ctx(formKey),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain(`/f/${formKey}?sent=1`);
    expect(await holder.db.contact.count({ where: { emails: { has: "ola@nord.io" } } })).toBe(1);
  });

  it("pretends success to bots (filled honeypot) but stores nothing", async () => {
    const before = await holder.db.contact.count();
    const res = await postLead(req(`/api/public/leads/${formKey}`, { headers: json(), body: JSON.stringify({ email: "bot@spam.io", hp: "x" }) }), ctx(formKey));
    expect(res.status).toBe(201);
    expect(await holder.db.contact.count()).toBe(before);
  });

  it("rejects unusable input with a clear error and bad content types", async () => {
    const res = await postLead(req(`/api/public/leads/${formKey}`, { headers: json(), body: JSON.stringify({ name: "No way to reach me" }) }), ctx(formKey));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("no_contact_method");
    expect((await postLead(req(`/api/public/leads/${formKey}`, { headers: { "content-type": "text/plain" }, body: "email=a@b.co" }), ctx(formKey))).status).toBe(415);
    expect((await postLead(req(`/api/public/leads/${formKey}`, { headers: json(), body: "{broken" }), ctx(formKey))).status).toBe(400);
    expect((await postLead(req(`/api/public/leads/missing`, { headers: json(), body: "{}" }), ctx("missing"))).status).toBe(404);
  });

  it("only lets allow-listed sites post from a browser, and echoes CORS only to them", async () => {
    const body = JSON.stringify({ email: "x@client.example" });
    const bad = await postLead(req(`/api/public/leads/${lockedKey}`, { headers: json({ origin: "https://evil.example" }), body }), ctx(lockedKey));
    expect(bad.status).toBe(403);
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
    const ok = await postLead(req(`/api/public/leads/${lockedKey}`, { headers: json({ origin: "https://client.example" }), body }), ctx(lockedKey));
    expect(ok.status).toBe(201);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://client.example");
    const pre = await optionsLead(req(`/api/public/leads/${lockedKey}`, { method: "OPTIONS", headers: { origin: "https://client.example" } }), ctx(lockedKey));
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe("https://client.example");
  });

  it("matches the site's origin even when the allow-list was typed with a slash, and refuses look-alikes", async () => {
    const body = JSON.stringify({ email: "lead@site.example" });
    for (const origin of ["https://clever-travel.club", "https://www.clever-travel.club"]) {
      const ok = await postLead(req(`/api/public/leads/${siteKey}`, { headers: json({ origin }), body }), ctx(siteKey));
      expect(ok.status, origin).toBe(201);
      expect(ok.headers.get("access-control-allow-origin")).toBe(origin);
    }
    for (const origin of ["https://clever-travel.club.evil.example", "http://clever-travel.club", "https://evil.example"]) {
      expect((await postLead(req(`/api/public/leads/${siteKey}`, { headers: json({ origin }), body }), ctx(siteKey))).status, origin).toBe(403);
    }
    const pre = await optionsLead(req(`/api/public/leads/${siteKey}`, { method: "OPTIONS", headers: { origin: "https://clever-travel.club" } }), ctx(siteKey));
    expect(pre.headers.get("access-control-allow-origin")).toBe("https://clever-travel.club");
  });

  it("honours Idempotency-Key and rate-limits abusive senders", async () => {
    const headers = json({ "idempotency-key": "retry-1" });
    const body = JSON.stringify({ name: "Retry Rita", email: "rita@retry.io" });
    expect((await postLead(req(`/api/public/leads/${formKey}`, { headers, body }), ctx(formKey))).status).toBe(201);
    const again = await postLead(req(`/api/public/leads/${formKey}`, { headers, body }), ctx(formKey));
    expect((await again.json()).status).toBe("duplicate");
    expect(await holder.db.contact.count({ where: { emails: { has: "rita@retry.io" } } })).toBe(1);

    let last = 0;
    for (let i = 0; i < 12; i++) last = (await postLead(req(`/api/public/leads/${formKey}`, { headers: json(), body: JSON.stringify({ email: `spam${i}@x.io` }) }), ctx(formKey))).status;
    expect(last).toBe(429);
  });
});

describe("inbound webhook", () => {
  const hook = (headers: Record<string, string>, body: unknown) => postHook(req("/api/public/hooks/leads", { headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));

  it("needs a valid bearer token", async () => {
    expect((await hook({}, { email: "a@b.co" })).status).toBe(401);
    expect((await hook({ authorization: "Bearer mol_wrong" }, { email: "a@b.co" })).status).toBe(401);
  });

  it("creates a lead from a Tilda-style payload and is idempotent", async () => {
    const headers = { authorization: `Bearer ${token}`, "idempotency-key": "tilda-42" };
    const res = await hook(headers, { Name: "Иван Петров", Email: "ivan@petrov.ru", Phone: "+7 900 123 45 67", Comment: "Нужен сайт" });
    expect(res.status).toBe(201);
    const first = await res.json();
    expect(first).toMatchObject({ ok: true, status: "created" });
    const again = await (await hook(headers, { Name: "Иван Петров", Email: "ivan@petrov.ru" })).json();
    expect(again).toMatchObject({ status: "duplicate", dealId: first.dealId });
    const contact = await holder.db.contact.findFirstOrThrow({ where: { emails: { has: "ivan@petrov.ru" } } });
    expect(contact).toMatchObject({ firstName: "Иван", lastName: "Петров" });
  });

  it("stops working as soon as the token is rotated", async () => {
    const { token: fresh } = await rotateWebhookToken(owner, wsId);
    expect((await hook({ authorization: `Bearer ${token}` }, { email: "late@x.io" })).status).toBe(401);
    expect((await hook({ authorization: `Bearer ${fresh}` }, { email: "late@x.io" })).status).toBe(201);
  });
});
