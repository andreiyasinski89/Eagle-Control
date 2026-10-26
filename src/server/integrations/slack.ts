import { createHmac } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { ApiError, forbidden } from "@/server/http/errors";
import { can } from "@/server/policies";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { registerChannel, type ChannelAdapter } from "@/server/services/notify";
import { appUrl, httpJson, IntegrationError, notConfigured, requireIntegrations, safeEqual, signState, slugOf, verifyState } from "./common";

export const SLACK_EVENTS = ["lead", "deal_won", "project_red", "sprint_ended"] as const;
export type SlackEvent = (typeof SLACK_EVENTS)[number];
const SCOPES = ["chat:write", "chat:write.public", "channels:read", "users:read", "users:read.email"];

export const slackConfigured = () => !!env().SLACK_CLIENT_ID && !!env().SLACK_CLIENT_SECRET && !!env().SLACK_SIGNING_SECRET;

interface SlackConfig {
  teamId: string;
  teamName: string;
  /** Event → channel id. An event without a channel is not announced. */
  routes: Partial<Record<SlackEvent, string>>;
}

const callbackUrl = () => `${appUrl()}/api/integrations/slack/callback`;

async function admin(userId: string, workspaceId: string) {
  const m = await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  if (!can(m, "member:invite")) throw forbidden(); // installing an app is an owner/admin decision
  await requireIntegrations(workspaceId);
}

/** Where to send the person to approve the app in Slack. */
export async function slackAuthorizeUrl(userId: string, workspaceId: string): Promise<string> {
  await admin(userId, workspaceId);
  if (!slackConfigured()) throw notConfigured("Slack");
  const state = signState({ u: userId, w: workspaceId, p: "slack" });
  const q = new URLSearchParams({ client_id: env().SLACK_CLIENT_ID as string, scope: SCOPES.join(","), redirect_uri: callbackUrl(), state });
  return `https://slack.com/oauth/v2/authorize?${q}`;
}

interface OAuthAccess {
  ok: boolean;
  access_token?: string;
  team?: { id: string; name: string };
  bot_user_id?: string;
}

/** Finishes the install: the state must be ours, unexpired, and still belong to a workspace admin. */
export async function slackCallback(code: string, state: string | null, userId: string): Promise<{ workspaceId: string }> {
  const s = verifyState<{ u: string; w: string; p: string }>(state);
  if (!s || s.p !== "slack" || s.u !== userId) throw new ApiError(400, "invalid_state", "This link has expired. Start the Slack connection again.");
  await admin(s.u, s.w);
  const res = await httpJson<OAuthAccess>("slack", "https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env().SLACK_CLIENT_ID as string, client_secret: env().SLACK_CLIENT_SECRET as string, redirect_uri: callbackUrl() }),
  });
  if (!res.access_token || !res.team) throw new IntegrationError("slack", "no access token in the answer");
  const config: SlackConfig = { teamId: res.team.id, teamName: res.team.name, routes: {} };
  const prior = await db.integration.findUnique({ where: { workspaceId_kind: { workspaceId: s.w, kind: "SLACK" } } });
  if (prior) config.routes = (prior.config as unknown as SlackConfig).routes ?? {};
  const secretEnc = encryptJson({ botToken: res.access_token });
  await db.integration.upsert({
    where: { workspaceId_kind: { workspaceId: s.w, kind: "SLACK" } },
    create: { workspaceId: s.w, kind: "SLACK", config: config as unknown as Prisma.InputJsonValue, secretEnc },
    update: { config: config as unknown as Prisma.InputJsonValue, secretEnc },
  });
  return { workspaceId: s.w };
}

async function load(workspaceId: string) {
  const row = await db.integration.findUnique({ where: { workspaceId_kind: { workspaceId, kind: "SLACK" } } });
  if (!row?.secretEnc) return null;
  return { config: row.config as unknown as SlackConfig, token: decryptJson<{ botToken: string }>(row.secretEnc).botToken };
}

/** Form-encoded, which every Web API method accepts (some read methods refuse JSON bodies). */
const slackApi = <T>(token: string, method: string, params: Record<string, string | number | boolean> = {}) =>
  httpJson<T>("slack", `https://slack.com/api/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });

export async function slackStatus(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const cur = await load(workspaceId);
  return { configured: slackConfigured(), connected: !!cur, teamName: cur?.config.teamName ?? null, routes: cur?.config.routes ?? {} };
}

export async function listSlackChannels(userId: string, workspaceId: string): Promise<{ id: string; name: string }[]> {
  await admin(userId, workspaceId);
  const cur = await load(workspaceId);
  if (!cur) throw new ApiError(409, "not_connected", "Slack is not connected");
  const res = await slackApi<{ channels?: { id: string; name: string; is_archived?: boolean }[] }>(cur.token, "conversations.list", { types: "public_channel", exclude_archived: true, limit: 200 });
  return (res.channels ?? []).filter((c) => !c.is_archived).map((c) => ({ id: c.id, name: c.name }));
}

export const routesSchema = z.object({ routes: z.object({ lead: z.string().max(40).nullable(), deal_won: z.string().max(40).nullable(), project_red: z.string().max(40).nullable(), sprint_ended: z.string().max(40).nullable() }).partial() });

export async function setSlackRoutes(userId: string, workspaceId: string, input: z.infer<typeof routesSchema>) {
  await admin(userId, workspaceId);
  const row = await db.integration.findUnique({ where: { workspaceId_kind: { workspaceId, kind: "SLACK" } } });
  if (!row) throw new ApiError(409, "not_connected", "Slack is not connected");
  const config = row.config as unknown as SlackConfig;
  const routes = { ...config.routes };
  for (const [k, v] of Object.entries(input.routes)) {
    if (v) routes[k as SlackEvent] = v;
    else delete routes[k as SlackEvent];
  }
  await db.integration.update({ where: { id: row.id }, data: { config: { ...config, routes } as unknown as Prisma.InputJsonValue } });
  return { routes };
}

export async function disconnectSlack(userId: string, workspaceId: string): Promise<void> {
  await admin(userId, workspaceId);
  await db.integration.deleteMany({ where: { workspaceId, kind: "SLACK" } });
}

// ── announcements ──────────────────────────────────────────────────────────

/**
 * Posts a workspace event to its Slack channel, if one is routed. Best effort: a Slack outage must never fail the sale or
 * the sprint that caused the message, so errors are logged. One retry when Slack asks us to slow down.
 */
/** `url` is workspace-relative, like notification URLs (`/crm?deal=…`). */
export async function announceToSlack(workspaceId: string, event: SlackEvent, msg: { title: string; body?: string; url?: string }): Promise<void> {
  try {
    const cur = await load(workspaceId);
    const channel = cur?.config.routes[event];
    if (!cur || !channel) return;
    const link = msg.url ? `${appUrl()}/w/${await slugOf(workspaceId)}${msg.url}` : null;
    const text = `*${msg.title}*${msg.body ? `\n${msg.body}` : ""}${link ? `\n<${link}|Open in MeetOwl>` : ""}`;
    const post = () => slackApi(cur.token, "chat.postMessage", { channel, text });
    try {
      await post();
    } catch (e) {
      if (e instanceof IntegrationError && e.status === 429) {
        await new Promise((r) => setTimeout(r, 1500));
        await post();
      } else throw e;
    }
  } catch (e) {
    console.error(`slack announce ${event} failed`, e instanceof Error ? e.message : e);
  }
}

/** Direct message to one person, matched to their Slack account by e-mail address. Used by notification preferences. */
export const slackChannel: ChannelAdapter = {
  id: "slack",
  async deliver(recipient, n) {
    const cur = await load(n.workspaceId);
    if (!cur) return false;
    const found = await slackApi<{ user?: { id: string } }>(cur.token, "users.lookupByEmail", { email: recipient.email }).catch((e) => {
      if (e instanceof IntegrationError && /users_not_found/.test(e.message)) return null;
      throw e;
    });
    if (!found?.user) return false; // no Slack account with this e-mail: nothing to retry
    await slackApi(cur.token, "chat.postMessage", { channel: found.user.id, text: `*${n.title}*${n.body ? `\n${n.body}` : ""}${n.url ? `\n<${appUrl()}${n.url}|Open in MeetOwl>` : ""}` });
    return true;
  },
};
registerChannel(slackChannel);

// ── incoming requests ──────────────────────────────────────────────────────

/** Slack signs every request: v0=HMAC-SHA256("v0:<timestamp>:<body>"). Requests older than 5 minutes are replays. */
export function verifySlackSignature(rawBody: string, timestamp: string | null, signature: string | null, now = Date.now()): boolean {
  const secret = env().SLACK_SIGNING_SECRET;
  if (!secret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const expected = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  return safeEqual(signature, expected);
}

/** Events we care about: Slack's URL check, and the app being removed from the team (then our token is dead). */
export async function handleSlackEvent(body: { type?: string; challenge?: string; team_id?: string; event?: { type?: string } }): Promise<{ challenge?: string }> {
  if (body.type === "url_verification") return { challenge: body.challenge };
  if (body.type === "event_callback" && body.team_id && (body.event?.type === "app_uninstalled" || body.event?.type === "tokens_revoked")) {
    const rows = await db.integration.findMany({ where: { kind: "SLACK" }, select: { id: true, config: true } });
    for (const r of rows) if ((r.config as unknown as SlackConfig).teamId === body.team_id) await db.integration.delete({ where: { id: r.id } });
  }
  return {};
}
