import { createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { ApiError, forbidden, notFound } from "@/server/http/errors";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { hasFeature } from "@/modules/plans";
import { planFeatureRequired } from "@/server/services/metrics";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { can } from "@/server/policies";

export const WEBHOOK_EVENTS = ["project.changed", "deal.won", "lead.created"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
export const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];

// ── keeping deliveries away from our own network ───────────────────────────

/** Loopback, private, link-local (cloud metadata), carrier-grade NAT and unspecified addresses, v4 and v6. */
export function isPrivateAddress(ip: string): boolean {
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1] as string);
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb");
}

/** Replaceable in tests; production resolves with the system resolver. */
export const resolver = { resolve: async (host: string): Promise<string[]> => (await lookup(host, { all: true })).map((a) => a.address) };

/** https only, no credentials in the URL, and every address the host resolves to must be public. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ApiError(422, "invalid_url", "That is not a valid URL");
  }
  if (u.protocol !== "https:") throw new ApiError(422, "https_required", "Webhook URLs must use https");
  if (u.username || u.password) throw new ApiError(422, "invalid_url", "Do not put credentials in the URL");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) throw new ApiError(422, "private_url", "That address is not reachable from the internet");
  const addresses = isIP(host) ? [host] : await resolver.resolve(host).catch(() => []);
  if (addresses.length === 0) throw new ApiError(422, "unresolvable_url", "That host does not resolve");
  if (addresses.some(isPrivateAddress)) throw new ApiError(422, "private_url", "That address is not reachable from the internet");
  return u;
}

// ── managing endpoints ─────────────────────────────────────────────────────

export const createEndpointSchema = z.object({ url: z.string().url().max(500), events: z.array(z.enum(WEBHOOK_EVENTS)).min(1) });

async function admin(userId: string, workspaceId: string) {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  if (!can(m, "member:invite")) throw forbidden();
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { plan: true } });
  if (!hasFeature(ws.plan, "api")) throw planFeatureRequired("api");
}

export async function createEndpoint(userId: string, workspaceId: string, input: z.infer<typeof createEndpointSchema>) {
  await admin(userId, workspaceId);
  if ((await db.webhookEndpoint.count({ where: { workspaceId } })) >= 10) throw new ApiError(422, "too_many_endpoints", "Remove an endpoint before adding another");
  const url = await assertPublicUrl(input.url);
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const row = await db.webhookEndpoint.create({ data: { workspaceId, url: url.toString(), events: [...new Set(input.events)], secretEnc: encryptSecret(secret), createdById: userId } });
  return { id: row.id, url: row.url, events: row.events, secret }; // the secret is shown once, here
}

export async function listEndpoints(userId: string, workspaceId: string) {
  await admin(userId, workspaceId);
  const rows = await db.webhookEndpoint.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" } });
  const failed = await db.webhookDelivery.groupBy({ by: ["endpointId"], where: { endpointId: { in: rows.map((r) => r.id) }, status: "failed" }, _count: true });
  const failures = new Map(failed.map((f) => [f.endpointId, f._count]));
  return rows.map((r) => ({ id: r.id, url: r.url, events: r.events, enabled: r.enabled, failedDeliveries: failures.get(r.id) ?? 0, createdAt: r.createdAt }));
}

export async function deleteEndpoint(userId: string, endpointId: string) {
  const e = await db.webhookEndpoint.findUnique({ where: { id: endpointId } });
  if (!e) throw notFound("endpoint");
  await admin(userId, e.workspaceId);
  await db.webhookEndpoint.delete({ where: { id: endpointId } });
}

export async function setEnabled(userId: string, endpointId: string, enabled: boolean) {
  const e = await db.webhookEndpoint.findUnique({ where: { id: endpointId } });
  if (!e) throw notFound("endpoint");
  await admin(userId, e.workspaceId);
  await db.webhookEndpoint.update({ where: { id: endpointId }, data: { enabled } });
}

/** Queues a `ping` so a person can check their receiver and its signature check. */
export async function sendTest(userId: string, endpointId: string) {
  const e = await db.webhookEndpoint.findUnique({ where: { id: endpointId } });
  if (!e) throw notFound("endpoint");
  await admin(userId, e.workspaceId);
  await db.webhookDelivery.create({ data: { endpointId, event: "ping", payload: envelope("ping", e.workspaceId, { message: "Hello from MeetOwl" }) as Prisma.InputJsonValue } });
  return deliverDue(new Date(Date.now() + 1000)); // the row was stamped by the database a moment ago
}

// ── emitting and delivering ────────────────────────────────────────────────

const envelope = (event: string, workspaceId: string, data: Record<string, unknown>, now = new Date()) => ({ id: `evt_${randomBytes(9).toString("hex")}`, event, createdAt: now.toISOString(), workspaceId, data });

/**
 * Queues one delivery per subscribed endpoint. Called after the change committed; never throws into the caller.
 * With `coalesceOn`, a change that an undelivered, never-tried delivery already announces is not queued again.
 */
export async function emit(workspaceId: string, event: WebhookEvent, data: Record<string, unknown>, coalesceOn?: string): Promise<void> {
  try {
    const endpoints = await db.webhookEndpoint.findMany({ where: { workspaceId, enabled: true, events: { has: event } }, select: { id: true } });
    for (const e of endpoints) {
      if (coalesceOn && data[coalesceOn] !== undefined) {
        const dup = await db.webhookDelivery.findFirst({ where: { endpointId: e.id, event, status: "pending", attempts: 0, payload: { path: ["data", coalesceOn], equals: data[coalesceOn] as string } }, select: { id: true } });
        if (dup) continue;
      }
      await db.webhookDelivery.create({ data: { endpointId: e.id, event, payload: envelope(event, workspaceId, data) as Prisma.InputJsonValue } });
    }
  } catch (err) {
    console.error("webhook emit failed", event, err instanceof Error ? err.message : err);
  }
}

let chain: Promise<void> = Promise.resolve();

/**
 * Project ids → workspace, then one `project.changed` per project. Runs one at a time per process, so a burst of
 * saves is coalesced instead of racing past the "already queued?" check.
 */
export function emitProjectsChanged(projectIds: readonly string[]): Promise<void> {
  if (projectIds.length === 0) return Promise.resolve();
  chain = chain.then(() => emitProjects(projectIds));
  return chain;
}

async function emitProjects(projectIds: readonly string[]): Promise<void> {
  try {
    const projects = await db.node.findMany({ where: { id: { in: [...projectIds] } }, select: { id: true, workspaceId: true } });
    for (const p of projects) await emit(p.workspaceId, "project.changed", { projectId: p.id }, "projectId");
  } catch (err) {
    console.error("webhook emit failed", err instanceof Error ? err.message : err);
  }
}

export const sign = (secret: string, body: string, t: number) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

/** Sends what is due. Failures back off 1 min, 5 min, 30 min, 2 h, 12 h, then the delivery is marked failed. */
export async function deliverDue(now = new Date(), limit = 50): Promise<{ delivered: number; retried: number; failed: number }> {
  const due = await db.webhookDelivery.findMany({ where: { status: "pending", nextAttemptAt: { lte: now } }, orderBy: { nextAttemptAt: "asc" }, take: limit, include: { endpoint: true } });
  const out = { delivered: 0, retried: 0, failed: 0 };
  for (const d of due) {
    let error: string | null = null;
    try {
      if (!d.endpoint.enabled) throw new Error("endpoint disabled");
      const url = await assertPublicUrl(d.endpoint.url); // checked again now: DNS may have changed since it was saved
      const body = JSON.stringify(d.payload);
      const res = await fetch(url, {
        method: "POST",
        redirect: "manual", // a redirect could point anywhere; treat it as a failure
        headers: { "content-type": "application/json", "user-agent": "MeetOwl-Webhooks/1", "meetowl-event": d.event, "meetowl-delivery": d.id, "meetowl-signature": sign(decryptSecret(d.endpoint.secretEnc), body, Math.floor(now.getTime() / 1000)) },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status < 200 || res.status >= 300) error = `HTTP ${res.status}`;
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 200) : "failed";
    }
    if (!error) {
      await db.webhookDelivery.update({ where: { id: d.id }, data: { status: "delivered", attempts: d.attempts + 1, deliveredAt: now, lastError: null } });
      out.delivered++;
    } else if (d.attempts + 1 >= BACKOFF_MS.length + 1) {
      await db.webhookDelivery.update({ where: { id: d.id }, data: { status: "failed", attempts: d.attempts + 1, lastError: error } });
      out.failed++;
    } else {
      await db.webhookDelivery.update({ where: { id: d.id }, data: { attempts: d.attempts + 1, lastError: error, nextAttemptAt: new Date(now.getTime() + (BACKOFF_MS[d.attempts] as number)) } });
      out.retried++;
    }
  }
  return out;
}

/** Old finished deliveries are dropped after 30 days. */
export async function purgeDeliveries(now = new Date()): Promise<number> {
  return (await db.webhookDelivery.deleteMany({ where: { status: { not: "pending" }, createdAt: { lt: new Date(now.getTime() - 30 * 86_400_000) } } })).count;
}
