import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma, UserIntegration } from "@prisma/client";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { publishTreeSoon } from "@/server/realtime";
import { nodePath } from "@/server/services/links";
import { appUrl, httpJson, IntegrationError, notConfigured, requireIntegrations, safeEqual, signState, verifyState } from "./common";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.events openid email";
const HOUR = 3_600_000;

export const googleConfigured = () => !!env().GOOGLE_CAL_CLIENT_ID && !!env().GOOGLE_CAL_CLIENT_SECRET;
const redirectUri = () => `${appUrl()}/api/integrations/google/callback`;

interface GoogleConfig {
  calendarId: string;
  syncToken: string | null;
  /** Set when Google refuses our refresh token: the person must connect again. */
  error: string | null;
  watch: { channelId: string; resourceId: string; expiration: number; token: string } | null;
}

const cfg = (row: UserIntegration) => row.config as unknown as GoogleConfig;
/** Merges into the stored config, not the copy the caller holds: sync, watch and token code all write to it. */
async function saveCfg(row: UserIntegration, patch: Partial<GoogleConfig>): Promise<void> {
  const cur = await db.userIntegration.findUniqueOrThrow({ where: { id: row.id }, select: { config: true } });
  await db.userIntegration.update({ where: { id: row.id }, data: { config: { ...(cur.config as object), ...patch } as unknown as Prisma.InputJsonValue } });
}

/**
 * A fixed Google event id per node (base32hex, which Google requires). Creating twice, from two requests or two servers,
 * then fails with 409 instead of producing a duplicate event, and the second call simply updates the first.
 */
export function googleEventId(nodeId: string): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuv";
  let bits = "";
  for (const byte of createHash("sha256").update(`meetowl:${nodeId}`).digest()) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length && out.length < 32; i += 5) out += alphabet[Number.parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

// ── connecting ─────────────────────────────────────────────────────────────

export async function googleAuthorizeUrl(userId: string, workspaceId: string): Promise<string> {
  await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  await requireIntegrations(workspaceId);
  if (!googleConfigured()) throw notConfigured("Google Calendar");
  const state = signState({ u: userId, w: workspaceId, p: "google" });
  const q = new URLSearchParams({ client_id: env().GOOGLE_CAL_CLIENT_ID as string, redirect_uri: redirectUri(), response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state });
  return `${AUTH_URL}?${q}`;
}

interface TokenAnswer {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
}

const form = (o: Record<string, string>) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o) });

/** The account's address is in the id_token Google handed us directly over TLS, so it is read, not re-verified. */
function emailFrom(idToken: string | undefined): string | null {
  try {
    const payload = JSON.parse(Buffer.from((idToken ?? "").split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

/** `userId` is who is signed in now; it must be the person who started the connection. */
export async function googleCallback(code: string, state: string | null, userId: string): Promise<{ workspaceId: string }> {
  const s = verifyState<{ u: string; w: string; p: string }>(state);
  if (!s || s.p !== "google" || s.u !== userId) throw new ApiError(400, "invalid_state", "This link has expired. Start the Google connection again.");
  await loadWorkspaceMember(db, s.u, s.w, "workspace:read");
  await requireIntegrations(s.w);
  const t = await httpJson<TokenAnswer>("google", TOKEN_URL, form({ code, client_id: env().GOOGLE_CAL_CLIENT_ID as string, client_secret: env().GOOGLE_CAL_CLIENT_SECRET as string, redirect_uri: redirectUri(), grant_type: "authorization_code" }));
  if (!t.refresh_token) throw new IntegrationError("google", "Google did not return offline access; remove MeetOwl from your Google account permissions and connect again");
  const config: GoogleConfig = { calendarId: "primary", syncToken: null, error: null, watch: null };
  const data = { externalId: emailFrom(t.id_token), secretEnc: encryptJson({ refreshToken: t.refresh_token }), config: config as unknown as Prisma.InputJsonValue };
  const existing = await db.userIntegration.findFirst({ where: { userId: s.u, kind: "GOOGLE_CALENDAR", workspaceId: s.w } });
  const row = existing ? await db.userIntegration.update({ where: { id: existing.id }, data }) : await db.userIntegration.create({ data: { userId: s.u, workspaceId: s.w, kind: "GOOGLE_CALENDAR", ...data } });
  accessTokens.set(row.id, { token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 });
  await startSync(row).catch((e) => console.error("google first sync failed", e instanceof Error ? e.message : e));
  return { workspaceId: s.w };
}

export async function googleStatus(userId: string, workspaceId: string) {
  const row = await db.userIntegration.findFirst({ where: { userId, kind: "GOOGLE_CALENDAR", workspaceId } });
  return { configured: googleConfigured(), connected: !!row, email: row?.externalId ?? null, needsReconnect: !!row && !!cfg(row).error, watching: !!row && !!cfg(row).watch };
}

export async function disconnectGoogle(userId: string, workspaceId: string): Promise<void> {
  const row = await db.userIntegration.findFirst({ where: { userId, kind: "GOOGLE_CALENDAR", workspaceId } });
  if (!row) return;
  await stopWatch(row).catch(() => undefined);
  await revokeGoogle(row).catch(() => undefined); // take the permission away at Google too, not only forget it here
  await db.calendarLink.deleteMany({ where: { userId, node: { workspaceId } } }); // events stay in Google; the link is what we drop
  await db.userIntegration.delete({ where: { id: row.id } });
  accessTokens.delete(row.id);
}

/** Tells Google to void the refresh token, so MeetOwl no longer appears in the person's connected apps with live access. */
async function revokeGoogle(row: UserIntegration): Promise<void> {
  if (!row.secretEnc) return;
  const { refreshToken } = decryptJson<{ refreshToken: string }>(row.secretEnc);
  await httpJson("google", "https://oauth2.googleapis.com/revoke", form({ token: refreshToken }));
}

// ── tokens ─────────────────────────────────────────────────────────────────

const accessTokens = new Map<string, { token: string; exp: number }>();

async function accessToken(row: UserIntegration): Promise<string> {
  const hit = accessTokens.get(row.id);
  if (hit && hit.exp > Date.now()) return hit.token;
  if (!row.secretEnc) throw new IntegrationError("google", "not connected");
  const { refreshToken } = decryptJson<{ refreshToken: string }>(row.secretEnc);
  try {
    const t = await httpJson<TokenAnswer>("google", TOKEN_URL, form({ refresh_token: refreshToken, client_id: env().GOOGLE_CAL_CLIENT_ID as string, client_secret: env().GOOGLE_CAL_CLIENT_SECRET as string, grant_type: "refresh_token" }));
    accessTokens.set(row.id, { token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 });
    if (cfg(row).error) await saveCfg(row, { error: null });
    return t.access_token;
  } catch (e) {
    if (e instanceof IntegrationError && /invalid_grant/.test(e.message)) await saveCfg(row, { error: "reconnect" });
    throw e;
  }
}

const gcal = async <T>(row: UserIntegration, path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> => {
  const token = await accessToken(row);
  return httpJson<T>("google", `${API}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) } });
};

// ── push: MeetOwl → Google ─────────────────────────────────────────────────

interface EventData {
  startsAt?: string;
  endsAt?: string;
  attendeeIds?: string[];
  meetingUrl?: string;
  addMeet?: boolean;
  location?: string;
}

interface GoogleEvent {
  id: string;
  etag?: string;
  status?: string;
  summary?: string;
  updated?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

const iso = (d: string) => new Date(d).toISOString();

/**
 * Makes Google match an EVENT node: creates, updates or deletes the calendar event of whoever created the node. Other
 * attendees are invited by e-mail and see it in their own calendars. Safe to call any number of times.
 */
export async function pushEvent(nodeId: string): Promise<"created" | "updated" | "deleted" | "skipped"> {
  const node = await db.node.findUnique({ where: { id: nodeId } });
  if (!node || node.type !== "EVENT") return "skipped";
  const row = await db.userIntegration.findFirst({ where: { userId: node.createdById, kind: "GOOGLE_CALENDAR", workspaceId: node.workspaceId } });
  if (!row || cfg(row).error || !googleConfigured()) return "skipped";
  const link = await db.calendarLink.findUnique({ where: { nodeId } });
  const calendarId = encodeURIComponent(cfg(row).calendarId);
  const data = node.data as EventData;

  if (node.archivedAt || !data.startsAt) {
    if (!link) return "skipped";
    await gcal(row, `/calendars/${calendarId}/events/${encodeURIComponent(link.externalId)}?sendUpdates=all`, { method: "DELETE" }).catch((e) => {
      if (!(e instanceof IntegrationError && (e.status === 404 || e.status === 410))) throw e; // already gone is fine
    });
    await db.calendarLink.delete({ where: { nodeId } });
    return "deleted";
  }

  const start = iso(data.startsAt);
  const end = data.endsAt ? iso(data.endsAt) : new Date(new Date(start).getTime() + HOUR).toISOString();
  const attendees = data.attendeeIds?.length ? await db.user.findMany({ where: { id: { in: data.attendeeIds, not: node.createdById } }, select: { email: true } }) : [];
  const wantsMeet = !!data.addMeet && !data.meetingUrl;
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: node.workspaceId }, select: { slug: true } });
  const body = {
    id: googleEventId(node.id),
    summary: node.title,
    description: [node.description, `${appUrl()}/w/${ws.slug}${nodePath(node)}`].filter(Boolean).join("\n\n"),
    location: data.location,
    start: { dateTime: start, timeZone: "UTC" },
    end: { dateTime: end, timeZone: "UTC" },
    attendees: attendees.map((a) => ({ email: a.email })),
    extendedProperties: { private: { meetowlNodeId: node.id } },
    ...(wantsMeet ? { conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {}),
  };

  const update = (externalId: string) => gcal<GoogleEvent>(row, `/calendars/${calendarId}/events/${encodeURIComponent(externalId)}?conferenceDataVersion=1&sendUpdates=all`, { method: "PATCH", json: body });
  const res = link
    ? await update(link.externalId)
    : await gcal<GoogleEvent>(row, `/calendars/${calendarId}/events?conferenceDataVersion=1&sendUpdates=all`, { method: "POST", json: body }).catch((e) => {
        if (e instanceof IntegrationError && e.status === 409) return update(body.id); // created a moment ago by another request: update that one
        throw e;
      });

  await db.calendarLink.upsert({
    where: { nodeId },
    create: { nodeId, userId: row.userId, calendarId: cfg(row).calendarId, externalId: res.id, etag: res.etag ?? null },
    update: { externalId: res.id, etag: res.etag ?? null, lastSyncedAt: new Date() },
  });
  if (res.hangoutLink && res.hangoutLink !== data.meetingUrl) {
    // Written straight to the row: going through the node operations would push this change back to Google.
    await db.node.update({ where: { id: nodeId }, data: { data: { ...(node.data as object), meetingUrl: res.hangoutLink } as Prisma.InputJsonValue } });
    publishTreeSoon(node.rootId ?? node.id, node.createdById);
  }
  return link ? "updated" : "created";
}

// ── pull: Google → MeetOwl ─────────────────────────────────────────────────

interface EventList {
  items?: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

/** Window of the very first sync: only recent and future events matter for events created in MeetOwl. */
const INITIAL_LOOKBACK_MS = 7 * 86_400_000;

async function startSync(row: UserIntegration): Promise<void> {
  await pull(row, true);
  if (appUrl().startsWith("https://")) await startWatch(row).catch((e) => console.error("google watch not started", e instanceof Error ? e.message : e));
}

/**
 * Applies Google-side changes to linked events. Last write wins: if the node changed here after the last sync, our
 * version is pushed instead of being overwritten. Events that were not created from MeetOwl are never imported.
 */
export async function pull(row: UserIntegration, initial = false): Promise<{ applied: number; deleted: number; pushedBack: number }> {
  const calendarId = encodeURIComponent(cfg(row).calendarId);
  let syncToken = initial ? null : cfg(row).syncToken;
  const out = { applied: 0, deleted: 0, pushedBack: 0 };
  const items: GoogleEvent[] = [];
  let next: string | null = null;
  let token: string | null = null;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ showDeleted: "true", maxResults: "250" });
    if (syncToken) q.set("syncToken", syncToken);
    else q.set("timeMin", new Date(Date.now() - INITIAL_LOOKBACK_MS).toISOString());
    if (next) q.set("pageToken", next);
    let list: EventList;
    try {
      list = await gcal<EventList>(row, `/calendars/${calendarId}/events?${q}`);
    } catch (e) {
      if (e instanceof IntegrationError && e.status === 410 && syncToken) {
        // The sync token expired: start over from the lookback window.
        syncToken = null;
        next = null;
        items.length = 0;
        continue;
      }
      throw e;
    }
    items.push(...(list.items ?? []));
    next = list.nextPageToken ?? null;
    if (!next) {
      token = list.nextSyncToken ?? null;
      break;
    }
  }

  const pushBack: string[] = [];
  for (const item of items) {
    const nodeId = item.extendedProperties?.private?.meetowlNodeId;
    if (!nodeId) continue;
    const link = await db.calendarLink.findUnique({ where: { nodeId }, include: { node: true } });
    if (!link || link.userId !== row.userId || link.externalId !== item.id) continue;
    if (item.etag && item.etag === link.etag) continue; // our own change coming back
    const node = link.node;

    if (item.status === "cancelled") {
      if (!node.archivedAt) await db.node.update({ where: { id: nodeId }, data: { archivedAt: new Date() } });
      await db.calendarLink.delete({ where: { nodeId } });
      publishTreeSoon(node.rootId ?? node.id, row.userId);
      out.deleted++;
      continue;
    }
    if (node.updatedAt.getTime() > link.lastSyncedAt.getTime() + 1000) {
      pushBack.push(nodeId); // changed here after the last sync: ours wins
      continue;
    }
    const startsAt = item.start?.dateTime ?? (item.start?.date ? `${item.start.date}T00:00:00.000Z` : undefined);
    const endsAt = item.end?.dateTime ?? (item.end?.date ? `${item.end.date}T00:00:00.000Z` : undefined);
    const prior = node.data as EventData;
    const nextData: EventData = { ...prior, ...(startsAt ? { startsAt: new Date(startsAt).toISOString() } : {}), ...(endsAt ? { endsAt: new Date(endsAt).toISOString() } : {}), ...(item.hangoutLink ? { meetingUrl: item.hangoutLink } : {}) };
    await db.node.update({ where: { id: nodeId }, data: { ...(item.summary ? { title: item.summary } : {}), data: nextData as Prisma.InputJsonValue } });
    await db.calendarLink.update({ where: { nodeId }, data: { etag: item.etag ?? null, lastSyncedAt: new Date(Date.now() + 1500) } });
    publishTreeSoon(node.rootId ?? node.id, row.userId);
    out.applied++;
  }
  for (const id of pushBack) {
    await pushEvent(id);
    out.pushedBack++;
  }
  if (token) await saveCfg(row, { syncToken: token });
  return out;
}

export async function syncNow(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const row = await db.userIntegration.findFirst({ where: { userId, kind: "GOOGLE_CALENDAR", workspaceId } });
  if (!row) throw new ApiError(409, "not_connected", "Google Calendar is not connected");
  return pull(row);
}

// ── watch channel (push notifications from Google) ─────────────────────────

async function startWatch(row: UserIntegration): Promise<void> {
  const token = randomBytes(16).toString("hex");
  const channelId = randomUUID();
  const res = await gcal<{ resourceId: string; expiration: string }>(row, `/calendars/${encodeURIComponent(cfg(row).calendarId)}/events/watch`, {
    method: "POST",
    json: { id: channelId, type: "web_hook", address: `${appUrl()}/api/integrations/google/webhook`, token },
  });
  await saveCfg(row, { watch: { channelId, resourceId: res.resourceId, expiration: Number(res.expiration), token } });
}

async function stopWatch(row: UserIntegration): Promise<void> {
  const w = cfg(row).watch;
  if (!w) return;
  await gcal(row, "/channels/stop", { method: "POST", json: { id: w.channelId, resourceId: w.resourceId } });
}

/** Google calls this when a watched calendar changes. The channel token we chose proves the call is Google's. */
export async function handleGoogleWebhook(headers: { channelId: string | null; token: string | null; state: string | null }): Promise<"pulled" | "ignored"> {
  if (!headers.channelId || !headers.token) return "ignored";
  const rows = await db.userIntegration.findMany({ where: { kind: "GOOGLE_CALENDAR", config: { path: ["watch", "channelId"], equals: headers.channelId } } });
  const row = rows[0];
  const watch = row ? cfg(row).watch : null;
  if (!row || !watch || !safeEqual(watch.token, headers.token)) return "ignored";
  if (headers.state === "sync") return "ignored"; // handshake after registering the channel
  await pull(row);
  return "pulled";
}

/** Poll fallback and housekeeping, run every few minutes: pulls every connected calendar and renews expiring channels. */
export async function pollAll(now = new Date()): Promise<{ polled: number; failed: number }> {
  if (!googleConfigured()) return { polled: 0, failed: 0 };
  const rows = await db.userIntegration.findMany({ where: { kind: "GOOGLE_CALENDAR" } });
  let polled = 0;
  let failed = 0;
  for (const row of rows) {
    if (cfg(row).error) continue;
    try {
      await pull(row);
      const w = cfg(row).watch;
      if (appUrl().startsWith("https://") && (!w || w.expiration - now.getTime() < 24 * HOUR)) {
        await stopWatch(row).catch(() => undefined);
        await startWatch(row);
      }
      polled++;
    } catch (e) {
      failed++;
      console.error("google poll failed", e instanceof Error ? e.message : e);
    }
  }
  return { polled, failed };
}

