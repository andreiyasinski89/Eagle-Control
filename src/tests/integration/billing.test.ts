import { createHmac } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://x",
    AUTH_SECRET: "test-auth-secret",
    APP_URL: "https://app.example.test",
    STRIPE_SECRET_KEY: "sk_test_x",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
    STRIPE_PRICE_PRO: "price_pro",
  });
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
import { expireGrace, getBilling, handleStripeEvent, openPortal, startCheckout, verifyStripeSignature } from "@/server/services/billing";
import { createProject } from "@/server/services/nodes/ops";
import { GRACE_DAYS, planFor } from "@/modules/plans/billing";

const DAY = 86_400_000;
const at = (s: string) => new Date(`${s}Z`);

describe("plan from subscription state", () => {
  const now = at("2026-11-10T00:00:00");
  it("pays → Pro, not paying → Free, enterprise never touched", () => {
    expect(planFor("FREE", { status: "active", pastDueSince: null }, now)).toBe("PRO");
    expect(planFor("FREE", { status: "trialing", pastDueSince: null }, now)).toBe("PRO");
    for (const status of ["canceled", "unpaid", "incomplete_expired", "incomplete", "none"]) expect(planFor("PRO", { status, pastDueSince: null }, now)).toBe("FREE");
    expect(planFor("ENTERPRISE", { status: "canceled", pastDueSince: null }, now)).toBe("ENTERPRISE");
  });
  it("keeps Pro for the grace period after a failed payment, then drops", () => {
    expect(planFor("PRO", { status: "past_due", pastDueSince: new Date(now.getTime() - (GRACE_DAYS - 1) * DAY) }, now)).toBe("PRO");
    expect(planFor("PRO", { status: "past_due", pastDueSince: new Date(now.getTime() - (GRACE_DAYS + 1) * DAY) }, now)).toBe("FREE");
    expect(planFor("PRO", { status: "past_due", pastDueSince: null }, now)).toBe("PRO");
  });
});

let close: () => Promise<void>;
let owner: string;
let admin: string;
let ws: { id: string; slug: string };
const calls: { url: string; body: Record<string, string> }[] = [];
const fake = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const body = init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) : {};
  calls.push({ url, body });
  if (url.endsWith("/customers")) return new Response(JSON.stringify({ id: "cus_1" }));
  if (url.endsWith("/checkout/sessions")) return new Response(JSON.stringify({ url: "https://checkout.stripe.test/s1" }));
  if (url.endsWith("/billing_portal/sessions")) return new Response(JSON.stringify({ url: "https://portal.stripe.test/p1" }));
  return new Response("{}", { status: 404 });
});

let n = 0;
const sub = (over: Record<string, unknown> = {}) => ({ id: "sub_1", status: "active", customer: "cus_1", cancel_at_period_end: false, current_period_end: Math.floor(at("2026-12-10T00:00:00").getTime() / 1000), metadata: { workspaceId: ws.id }, ...over });
const event = (type: string, object: Record<string, unknown>, created = "2026-11-10T00:00:00") => ({ id: `evt_${++n}`, type, created: Math.floor(at(created).getTime() / 1000), data: { object } });
const planNow = async () => (await holder.db.workspace.findUniqueOrThrow({ where: { id: ws.id } })).plan;

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  admin = (await t.db.user.create({ data: { email: "a@x.io" } })).id;
  ws = await createWorkspace(owner, "Billing Co");
  await t.db.membership.create({ data: { userId: admin, workspaceId: ws.id, role: "ADMIN" } });
}, 120_000);
afterAll(async () => close?.());
beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal("fetch", fake);
});
afterEach(() => vi.unstubAllGlobals());

describe("checkout and portal", () => {
  it("lets only the owner start a checkout, creating the customer once", async () => {
    await expect(startCheckout(admin, ws.id)).rejects.toMatchObject({ status: 403 });
    const r = await startCheckout(owner, ws.id);
    expect(r.url).toBe("https://checkout.stripe.test/s1");
    const session = calls.find((c) => c.url.endsWith("/checkout/sessions"))!.body;
    expect(session).toMatchObject({ mode: "subscription", customer: "cus_1", client_reference_id: ws.id, "line_items[0][price]": "price_pro", "subscription_data[metadata][workspaceId]": ws.id });
    expect(session.success_url).toBe(`https://app.example.test/w/${ws.slug}/settings/billing?checkout=success`);
    await startCheckout(owner, ws.id);
    expect(calls.filter((c) => c.url.endsWith("/customers"))).toHaveLength(1);
  });

  it("opens the portal only for someone with a Stripe customer", async () => {
    expect((await openPortal(owner, ws.id)).url).toBe("https://portal.stripe.test/p1");
    const other = await createWorkspace(owner, "No Customer");
    await expect(openPortal(owner, other.id)).rejects.toMatchObject({ code: "no_customer" });
  });
});

describe("webhook signature", () => {
  const sign = (body: string, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex")}`;
  it("accepts a genuine signature and rejects forgeries and replays", () => {
    const body = '{"id":"evt"}';
    expect(verifyStripeSignature(body, sign(body))).toBe(true);
    expect(verifyStripeSignature(body + " ", sign(body))).toBe(false);
    expect(verifyStripeSignature(body, sign(body, Math.floor(Date.now() / 1000) - 3600))).toBe(false);
    expect(verifyStripeSignature(body, null)).toBe(false);
    expect(verifyStripeSignature(body, "t=1,v1=00")).toBe(false);
  });
});

describe("subscription lifecycle", () => {
  it("goes Pro when the subscription is active, and lifts the project limit", async () => {
    for (let i = 0; i < 3; i++) await createProject(owner, ws.id, { name: `P${i}` });
    await expect(createProject(owner, ws.id, { name: "P4" })).rejects.toMatchObject({ status: 402 });
    expect(await handleStripeEvent(event("checkout.session.completed", { client_reference_id: ws.id, customer: "cus_1", subscription: "sub_1" }))).toBe("applied");
    expect(await planNow()).toBe("FREE"); // checkout alone does not grant a plan
    expect(await handleStripeEvent(event("customer.subscription.created", sub()))).toBe("applied");
    expect(await planNow()).toBe("PRO");
    await createProject(owner, ws.id, { name: "P4" });
    const b = await getBilling(owner, ws.id);
    expect(b).toMatchObject({ status: "active", pastDue: false, hasCustomer: true, canManage: true });
    expect(b.renewsAt?.toISOString()).toBe("2026-12-10T00:00:00.000Z");
  });

  it("is idempotent and ignores older snapshots arriving late", async () => {
    const e = event("customer.subscription.updated", sub({ cancel_at_period_end: true }), "2026-11-11T00:00:00");
    expect(await handleStripeEvent(e)).toBe("applied");
    expect(await handleStripeEvent(e)).toBe("duplicate");
    expect(await handleStripeEvent(event("customer.subscription.updated", sub({ status: "canceled" }), "2026-11-05T00:00:00"))).toBe("ignored");
    expect(await planNow()).toBe("PRO");
    expect((await getBilling(owner, ws.id)).cancelAtPeriodEnd).toBe(true);
  });

  it("lets a failed event be retried instead of losing it", async () => {
    const bad = { ...event("customer.subscription.updated", sub()), data: { object: null as unknown as Record<string, unknown> } };
    await expect(handleStripeEvent(bad)).rejects.toBeTruthy();
    expect(await holder.db.stripeEvent.count({ where: { id: bad.id } })).toBe(0);
  });

  it("warns owners on a failed payment, keeps Pro through the grace period, then drops to Free without deleting anything", async () => {
    await handleStripeEvent(event("invoice.payment_failed", { customer: "cus_1" }, "2026-11-12T00:00:00"));
    await handleStripeEvent(event("customer.subscription.updated", sub({ status: "past_due" }), "2026-11-12T00:01:00"));
    expect(await planNow()).toBe("PRO");
    const b = await getBilling(owner, ws.id, at("2026-11-15T00:00:00"));
    expect(b).toMatchObject({ pastDue: true, graceExpired: false });
    expect(await holder.db.notification.count({ where: { userId: owner, kind: "billing" } })).toBeGreaterThan(0);

    expect(await expireGrace(at("2026-11-15T00:00:00"))).toEqual({ downgraded: 0 });
    expect(await expireGrace(at("2026-11-20T00:00:00"))).toEqual({ downgraded: 1 });
    expect(await planNow()).toBe("FREE");
    expect(await holder.db.node.count({ where: { workspaceId: ws.id, type: "PROJECT" } })).toBe(4); // nothing deleted
    await expect(createProject(owner, ws.id, { name: "Over the limit" })).rejects.toMatchObject({ status: 402 });
  });

  it("recovers when the invoice is paid, and ends the plan when the subscription is deleted", async () => {
    await handleStripeEvent(event("customer.subscription.updated", sub(), "2026-11-21T00:00:00"));
    await handleStripeEvent(event("invoice.paid", { customer: "cus_1" }, "2026-11-21T00:01:00"));
    expect(await planNow()).toBe("PRO");
    expect((await getBilling(owner, ws.id)).pastDue).toBe(false);
    await handleStripeEvent(event("customer.subscription.deleted", sub(), "2026-12-01T00:00:00"));
    expect(await planNow()).toBe("FREE");
    expect((await getBilling(owner, ws.id)).status).toBe("canceled");
  });

  it("ignores events for workspaces it does not know and event types it does not handle", async () => {
    expect(await handleStripeEvent(event("customer.subscription.updated", sub({ customer: "cus_unknown", metadata: {} })))).toBe("ignored");
    expect(await handleStripeEvent(event("charge.refunded", {}))).toBe("ignored");
  });
});
