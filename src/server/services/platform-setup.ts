import { z } from "zod";
import { env } from "@/lib/env";
import { googleConfigured } from "@/server/integrations/google";
import { slackConfigured } from "@/server/integrations/slack";
import { setTelegramWebhook, telegramBotCheck, telegramConfigured, telegramWebhookState, telegramWebhookUrl } from "@/server/integrations/telegram";
import { appUrl } from "@/server/integrations/common";
import { jobsMode } from "@/server/jobs";
import { requireSuperAdmin } from "./admin";

export const PROVIDERS = ["inngest", "telegram", "google", "slack", "claude"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const setupTestSchema = z.object({ provider: z.enum(PROVIDERS) });

const set = (v: string | undefined) => !!v && v.trim() !== "";

/**
 * What the platform owner still has to do, per outside service: which settings are filled (only whether they are, never their values),
 * and the addresses to paste into the provider's console, worked out from the installation's own address.
 */
export async function getPlatformSetup(userId: string) {
  await requireSuperAdmin(userId);
  const e = env();
  const base = appUrl();
  const vars = (names: [string, string | undefined][]) => names.map(([name, v]) => ({ name, set: set(v) }));
  return {
    appUrl: base,
    https: base.startsWith("https://"),
    providers: [
      { id: "inngest" as const, ready: set(e.INNGEST_EVENT_KEY) && set(e.INNGEST_SIGNING_KEY) && jobsMode() === "inngest", vars: vars([["INNGEST_EVENT_KEY", e.INNGEST_EVENT_KEY], ["INNGEST_SIGNING_KEY", e.INNGEST_SIGNING_KEY], ["JOBS_MODE", e.JOBS_MODE]]), values: [{ key: "syncUrl", value: `${base}/api/inngest` }] },
      { id: "telegram" as const, ready: telegramConfigured() && set(e.TELEGRAM_BOT_USERNAME), vars: vars([["TELEGRAM_BOT_TOKEN", e.TELEGRAM_BOT_TOKEN], ["TELEGRAM_BOT_USERNAME", e.TELEGRAM_BOT_USERNAME], ["TELEGRAM_WEBHOOK_SECRET", e.TELEGRAM_WEBHOOK_SECRET]]), values: [{ key: "webhookUrl", value: telegramWebhookUrl() }] },
      { id: "google" as const, ready: googleConfigured(), vars: vars([["GOOGLE_CAL_CLIENT_ID", e.GOOGLE_CAL_CLIENT_ID], ["GOOGLE_CAL_CLIENT_SECRET", e.GOOGLE_CAL_CLIENT_SECRET]]), values: [{ key: "redirectUri", value: `${base}/api/integrations/google/callback` }] },
      { id: "slack" as const, ready: slackConfigured(), vars: vars([["SLACK_CLIENT_ID", e.SLACK_CLIENT_ID], ["SLACK_CLIENT_SECRET", e.SLACK_CLIENT_SECRET], ["SLACK_SIGNING_SECRET", e.SLACK_SIGNING_SECRET]]), values: [{ key: "redirectUri", value: `${base}/api/integrations/slack/callback` }, { key: "eventsUrl", value: `${base}/api/integrations/slack/events` }] },
      { id: "claude" as const, ready: base.startsWith("https://"), vars: [], values: [{ key: "connectorUrl", value: `${base}/api/mcp` }] },
    ],
  };
}

export type SetupCheck = { ok: boolean; code: string; detail?: string | null };

/**
 * A quick check of one service. It answers with a code that the page turns into plain words. Google and Slack can only be checked fully by
 * a real connection, so here their keys are checked for being there and looking right.
 */
export async function testPlatformProvider(userId: string, provider: Provider): Promise<SetupCheck> {
  await requireSuperAdmin(userId);
  const e = env();
  const https = appUrl().startsWith("https://");
  switch (provider) {
    case "inngest":
      if (!set(e.INNGEST_EVENT_KEY) || !set(e.INNGEST_SIGNING_KEY)) return { ok: false, code: "inngest_keys" };
      if (jobsMode() !== "inngest") return { ok: false, code: "inngest_mode" };
      return { ok: true, code: "inngest_ok" };
    case "telegram": {
      if (!https) return { ok: false, code: "https" };
      if (!telegramConfigured()) return { ok: false, code: "telegram_keys" };
      const bot = await telegramBotCheck();
      if (!bot) return { ok: false, code: "telegram_token" };
      const named = (e.TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, "").toLowerCase();
      if (!named) return { ok: false, code: "telegram_username", detail: bot.username };
      if (bot.username && bot.username.toLowerCase() !== named) return { ok: false, code: "telegram_mismatch", detail: bot.username };
      const hook = await telegramWebhookState();
      if (hook && !hook.ok) return { ok: false, code: "telegram_webhook", detail: hook.lastError };
      return { ok: true, code: "telegram_ok", detail: bot.username };
    }
    case "google":
      if (!https) return { ok: false, code: "https" };
      if (!googleConfigured()) return { ok: false, code: "google_keys" };
      if (!/\.apps\.googleusercontent\.com$/.test((e.GOOGLE_CAL_CLIENT_ID ?? "").trim())) return { ok: false, code: "google_id" };
      return { ok: true, code: "google_ok" };
    case "slack":
      if (!https) return { ok: false, code: "https" };
      if (!slackConfigured()) return { ok: false, code: "slack_keys" };
      return { ok: true, code: "slack_ok" };
    case "claude":
      return https ? { ok: true, code: "claude_ok" } : { ok: false, code: "https" };
  }
}

/** Points Telegram at this installation (the one-time step that used to be a command typed by hand). */
export async function connectTelegramBot(userId: string) {
  await requireSuperAdmin(userId);
  return setTelegramWebhook();
}
