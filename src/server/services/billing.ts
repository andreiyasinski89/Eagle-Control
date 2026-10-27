import { createHmac } from "node:crypto";
import type { Plan } from "@prisma/client";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { ApiError, forbidden } from "@/server/http/errors";
import { httpJson, IntegrationError, notConfigured, safeEqual } from "@/server/integrations/common";
import { graceEndsAt, planFor } from "@/modules/plans/billing";
import { can } from "@/server/policies";
import { loadWorkspaceMember } from "./nodes/access";
import { notify } from "./notify";
import { entitlementOf, syncPlan } from "./entitlements";
import { isEnforcedFor } from "./paid-plans";
import { getUsage } from "./workspace";

export const billingConfigured = () => !!env().STRIPE_SECRET_KEY && !!env().STRIPE_PRICE_PRO;
const appUrl = () => env().APP_URL.replace(/\/$/, "");

/** Stripe's API takes form-encoded bodies with bracketed keys (`line_items[0][price]`). */
const stripe = <T>(path: string, params: Record<string, string> = {}) =>
  httpJson<T>("stripe", `https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${env().STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });

async function owner(userId: string, workspaceId: string) {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  if (!can(m, "billing:manage")) throw forbidden(); // only the owner changes the subscription
  return m;
}

// ── what the billing page shows ────────────────────────────────────────────

export async function getBilling(userId: string, workspaceId: string, now = new Date()) {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { plan: true, basePlan: true } });
  const sub = await db.subscription.findUnique({ where: { workspaceId } });
  const grace = sub?.status === "past_due" && sub.pastDueSince ? graceEndsAt(sub.pastDueSince) : null;
  return {
    configured: billingConfigured(),
    canManage: can(m, "billing:manage"),
    status: sub?.status ?? "none",
    /** Pro that the administrator gave (PRO_OWNER_EMAILS), not a Stripe subscription. */
    granted: !sub && ws.basePlan !== "FREE",
    entitlement: await entitlementOf(workspaceId, now),
    /** False while paid plans are off for this workspace: everything is open and nothing can be bought yet. */
    enforced: await isEnforcedFor(workspaceId),
    renewsAt: sub?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
    pastDue: !!grace,
    graceEndsAt: grace,
    graceExpired: !!grace && grace <= now,
    hasCustomer: !!sub?.stripeCustomerId,
    ...(await getUsage(workspaceId, ws.plan)),
  };
}

// ── starting a subscription, managing it ───────────────────────────────────

async function customerFor(workspaceId: string, email: string, name: string): Promise<string> {
  const sub = await db.subscription.findUnique({ where: { workspaceId } });
  if (sub?.stripeCustomerId) return sub.stripeCustomerId;
  const c = await stripe<{ id: string }>("/customers", { email, name, "metadata[workspaceId]": workspaceId });
  await db.subscription.upsert({ where: { workspaceId }, create: { workspaceId, stripeCustomerId: c.id }, update: { stripeCustomerId: c.id } });
  return c.id;
}

/** URL of a Stripe Checkout page for the Pro plan. Plans are changed only by the webhook that follows, never by the return URL. */
export async function startCheckout(userId: string, workspaceId: string): Promise<{ url: string }> {
  await owner(userId, workspaceId);
  if (!billingConfigured()) throw notConfigured("Billing");
  if (!(await isEnforcedFor(workspaceId))) throw new ApiError(409, "paid_plans_off", "Paid plans are not open yet: everything is free for now");
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { plan: true, basePlan: true, name: true, slug: true } });
  // A trial, bonus or gift is no reason to refuse a subscription; a lasting paid plan is.
  if (ws.basePlan !== "FREE" || (ws.plan !== "FREE" && (await entitlementOf(workspaceId)).sources.length === 0)) throw new ApiError(409, "already_subscribed", "This workspace already has a paid plan");
  const me = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const customer = await customerFor(workspaceId, me.email, ws.name);
  const back = `${appUrl()}/w/${ws.slug}/settings/billing`;
  const s = await stripe<{ url: string }>("/checkout/sessions", {
    mode: "subscription",
    customer,
    client_reference_id: workspaceId,
    "line_items[0][price]": env().STRIPE_PRICE_PRO as string,
    "line_items[0][quantity]": "1",
    "subscription_data[metadata][workspaceId]": workspaceId,
    success_url: `${back}?checkout=success`,
    cancel_url: `${back}?checkout=cancelled`,
  });
  return { url: s.url };
}

/** Stripe's hosted page for card, invoices and cancelling. */
export async function openPortal(userId: string, workspaceId: string): Promise<{ url: string }> {
  await owner(userId, workspaceId);
  if (!billingConfigured()) throw notConfigured("Billing");
  const sub = await db.subscription.findUnique({ where: { workspaceId } });
  if (!sub?.stripeCustomerId) throw new ApiError(409, "no_customer", "There is no subscription to manage yet");
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { slug: true } });
  const s = await stripe<{ url: string }>("/billing_portal/sessions", { customer: sub.stripeCustomerId, return_url: `${appUrl()}/w/${ws.slug}/settings/billing` });
  return { url: s.url };
}

// ── webhook ────────────────────────────────────────────────────────────────

/** Stripe signs `<timestamp>.<body>` with the endpoint secret; calls older than five minutes are replays. */
export function verifyStripeSignature(rawBody: string, header: string | null, now = Date.now()): boolean {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  return header.split(",").filter((p) => p.startsWith("v1=")).some((p) => safeEqual(p.slice(3), expected));
}

interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
}
interface SubObject {
  id: string;
  status: string;
  customer: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  items?: { data?: { current_period_end?: number }[] };
  metadata?: { workspaceId?: string };
}

async function workspaceOf(customer: string | undefined, metadataId: string | undefined): Promise<string | null> {
  if (metadataId) return metadataId;
  if (!customer) return null;
  return (await db.subscription.findUnique({ where: { stripeCustomerId: customer }, select: { workspaceId: true } }))?.workspaceId ?? null;
}

async function setPlan(workspaceId: string, now: Date): Promise<Plan> {
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { basePlan: true } });
  const sub = await db.subscription.findUniqueOrThrow({ where: { workspaceId } });
  // The subscription decides the lasting plan; a running trial, bonus or gift may still keep Pro on top of it.
  const base = planFor(ws.basePlan, { status: sub.status, pastDueSince: sub.pastDueSince }, now);
  if (base !== ws.basePlan) await db.workspace.update({ where: { id: workspaceId }, data: { basePlan: base } });
  return (await syncPlan(workspaceId, now)).after;
}

async function tellOwners(workspaceId: string, title: string, body: string, key: string): Promise<void> {
  const owners = await db.membership.findMany({ where: { workspaceId, role: "OWNER" }, select: { userId: true } });
  for (const o of owners) await notify({ userId: o.userId, workspaceId, kind: "billing", title, body, url: "/settings/billing", dedupeKey: key });
}

/**
 * Applies one Stripe event. Safe to deliver twice (the event id is recorded) and in the wrong order (an older snapshot
 * of the subscription never overwrites a newer one). Returns what happened, for logs and tests.
 */
export async function handleStripeEvent(ev: StripeEvent, now = new Date()): Promise<"applied" | "duplicate" | "ignored"> {
  try {
    await db.stripeEvent.create({ data: { id: ev.id, type: ev.type } });
  } catch {
    return "duplicate";
  }
  try {
    return await applyEvent(ev, now);
  } catch (e) {
    await db.stripeEvent.delete({ where: { id: ev.id } }).catch(() => undefined); // not handled: let Stripe's retry through
    throw e;
  }
}

async function applyEvent(ev: StripeEvent, now: Date): Promise<"applied" | "ignored"> {
  const at = new Date(ev.created * 1000);
  const obj = ev.data.object;

  if (ev.type === "checkout.session.completed") {
    const wsId = String(obj.client_reference_id ?? "");
    if (!wsId) return "ignored";
    await db.subscription.upsert({
      where: { workspaceId: wsId },
      create: { workspaceId: wsId, stripeCustomerId: String(obj.customer ?? ""), externalId: obj.subscription ? String(obj.subscription) : null },
      update: { stripeCustomerId: String(obj.customer ?? ""), externalId: obj.subscription ? String(obj.subscription) : undefined },
    });
    return "applied"; // the plan itself follows from customer.subscription.* events
  }

  if (ev.type === "customer.subscription.created" || ev.type === "customer.subscription.updated" || ev.type === "customer.subscription.deleted") {
    const s = obj as unknown as SubObject;
    const wsId = await workspaceOf(s.customer, s.metadata?.workspaceId);
    if (!wsId) return "ignored";
    const prior = await db.subscription.findUnique({ where: { workspaceId: wsId } });
    if (prior?.lastEventAt && prior.lastEventAt > at) return "ignored"; // a newer snapshot is already stored
    const status = ev.type === "customer.subscription.deleted" ? "canceled" : s.status;
    const periodEnd = s.current_period_end ?? s.items?.data?.[0]?.current_period_end;
    const pastDueSince = status === "past_due" ? (prior?.pastDueSince ?? at) : null;
    await db.subscription.upsert({
      where: { workspaceId: wsId },
      create: { workspaceId: wsId, stripeCustomerId: s.customer, externalId: s.id, status, currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null, cancelAtPeriodEnd: !!s.cancel_at_period_end, pastDueSince, lastEventAt: at },
      update: { stripeCustomerId: s.customer, externalId: s.id, status, currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null, cancelAtPeriodEnd: !!s.cancel_at_period_end, pastDueSince, lastEventAt: at },
    });
    const before = (await db.workspace.findUniqueOrThrow({ where: { id: wsId }, select: { plan: true } })).plan;
    const after = await setPlan(wsId, now);
    if (before !== after) await tellOwners(wsId, after === "FREE" ? "Your subscription ended; the workspace is on the Free plan" : "Welcome to Pro", after === "FREE" ? "Nothing was deleted. Limits apply to new items again." : "All Pro features are on.", `plan:${ev.id}`);
    return "applied";
  }

  if (ev.type === "invoice.payment_failed" || ev.type === "invoice.paid") {
    const customer = String(obj.customer ?? "");
    const wsId = await workspaceOf(customer, undefined);
    if (!wsId) return "ignored";
    if (ev.type === "invoice.paid") {
      await db.subscription.update({ where: { workspaceId: wsId }, data: { pastDueSince: null } });
      return "applied";
    }
    const sub = await db.subscription.findUniqueOrThrow({ where: { workspaceId: wsId } });
    if (!sub.pastDueSince) await db.subscription.update({ where: { workspaceId: wsId }, data: { pastDueSince: at } });
    await tellOwners(wsId, "A payment failed", "Update the card in Settings → Billing within 7 days to keep Pro.", `payment_failed:${at.toISOString().slice(0, 10)}`);
    return "applied";
  }
  return "ignored";
}

/** Daily: workspaces whose grace period has run out drop to Free (Stripe may still be retrying, but the promise was 7 days). */
export async function expireGrace(now = new Date()): Promise<{ downgraded: number }> {
  const rows = await db.subscription.findMany({ where: { status: "past_due", pastDueSince: { not: null } }, select: { workspaceId: true } });
  let downgraded = 0;
  for (const r of rows) {
    const before = (await db.workspace.findUniqueOrThrow({ where: { id: r.workspaceId }, select: { plan: true } })).plan;
    if ((await setPlan(r.workspaceId, now)) !== before) {
      downgraded++;
      await tellOwners(r.workspaceId, "The workspace is back on the Free plan", "The last payment was not received. Nothing was deleted.", `grace:${r.workspaceId}:${now.toISOString().slice(0, 10)}`);
    }
  }
  return { downgraded };
}

/**
 * Ends the Stripe subscription of a workspace that is about to be deleted, so nobody keeps being charged for it.
 * Already ended or unknown subscriptions are fine. If Stripe cannot be reached the error propagates: do not delete first.
 */
export async function cancelSubscriptionNow(workspaceId: string): Promise<void> {
  const sub = await db.subscription.findUnique({ where: { workspaceId } });
  if (!sub?.externalId || sub.status === "canceled" || sub.status === "incomplete_expired" || sub.status === "none") return;
  if (!env().STRIPE_SECRET_KEY) throw new ApiError(503, "billing_unavailable", "The subscription cannot be cancelled right now");
  try {
    await httpJson("stripe", `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(sub.externalId)}`, { method: "DELETE", headers: { authorization: `Bearer ${env().STRIPE_SECRET_KEY}` } });
  } catch (e) {
    if (e instanceof IntegrationError && e.status === 404) return; // gone already
    throw e;
  }
}
