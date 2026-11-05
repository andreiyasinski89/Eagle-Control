import { z } from "zod";
import { env } from "@/lib/env";
import { googleConfigured } from "@/server/integrations/google";
import { slackConfigured } from "@/server/integrations/slack";
import { setTelegramWebhook, telegramBotCheck, telegramConfigured, telegramWebhookState, telegramWebhookUrl } from "@/server/integrations/telegram";
import { appUrl } from "@/server/integrations/common";
import { jobsMode } from "@/server/jobs";
import { db } from "@/server/db";
import { classifyMailError } from "@/server/mail/errors";
import { sendMail } from "@/server/mail";
import { mailSettingsHints } from "@/server/mail/hints";
import { requireSuperAdmin } from "./admin";

export const PROVIDERS = ["mail", "googleSignIn", "inngest", "telegram", "google", "slack", "claude"] as const;
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
  const mailBad = await recentMailFailures();
  return {
    mailFailures: mailBad,
    appUrl: base,
    https: base.startsWith("https://"),
    providers: [
      { id: "mail" as const, ready: mailConfigured() && mailBad.count === 0, vars: vars([["SMTP_HOST", e.SMTP_HOST], ["SMTP_USER", e.SMTP_USER], ["SMTP_PASS", e.SMTP_PASS], ["MAIL_FROM", e.MAIL_FROM], ["RESEND_API_KEY", e.RESEND_API_KEY]]), values: [] },
      { id: "googleSignIn" as const, ready: set(e.AUTH_GOOGLE_ID) && set(e.AUTH_GOOGLE_SECRET), vars: vars([["AUTH_GOOGLE_ID", e.AUTH_GOOGLE_ID], ["AUTH_GOOGLE_SECRET", e.AUTH_GOOGLE_SECRET]]), values: [{ key: "origin", value: base }, { key: "authRedirectUri", value: `${base}/api/auth/callback/google` }] },
      { id: "inngest" as const, ready: set(e.INNGEST_EVENT_KEY) && set(e.INNGEST_SIGNING_KEY) && jobsMode() === "inngest", vars: vars([["INNGEST_EVENT_KEY", e.INNGEST_EVENT_KEY], ["INNGEST_SIGNING_KEY", e.INNGEST_SIGNING_KEY], ["JOBS_MODE", e.JOBS_MODE]]), values: [{ key: "syncUrl", value: `${base}/api/inngest` }] },
      { id: "telegram" as const, ready: telegramConfigured() && set(e.TELEGRAM_BOT_USERNAME), vars: vars([["TELEGRAM_BOT_TOKEN", e.TELEGRAM_BOT_TOKEN], ["TELEGRAM_BOT_USERNAME", e.TELEGRAM_BOT_USERNAME], ["TELEGRAM_WEBHOOK_SECRET", e.TELEGRAM_WEBHOOK_SECRET]]), values: [{ key: "webhookUrl", value: telegramWebhookUrl() }] },
      { id: "google" as const, ready: googleConfigured(), vars: vars([["GOOGLE_CAL_CLIENT_ID", e.GOOGLE_CAL_CLIENT_ID], ["GOOGLE_CAL_CLIENT_SECRET", e.GOOGLE_CAL_CLIENT_SECRET]]), values: [{ key: "redirectUri", value: `${base}/api/integrations/google/callback` }] },
      { id: "slack" as const, ready: slackConfigured(), vars: vars([["SLACK_CLIENT_ID", e.SLACK_CLIENT_ID], ["SLACK_CLIENT_SECRET", e.SLACK_CLIENT_SECRET], ["SLACK_SIGNING_SECRET", e.SLACK_SIGNING_SECRET]]), values: [{ key: "redirectUri", value: `${base}/api/integrations/slack/callback` }, { key: "eventsUrl", value: `${base}/api/integrations/slack/events` }] },
      { id: "claude" as const, ready: base.startsWith("https://"), vars: [], values: [{ key: "connectorUrl", value: `${base}/api/mcp` }] },
    ],
  };
}

/** Whether anything is set up to send mail beyond the defaults, which point at a test server on the same machine. */
function mailConfigured(): boolean {
  const e = env();
  return set(e.RESEND_API_KEY) || (set(e.SMTP_USER) && set(e.SMTP_PASS)) || !["localhost", "127.0.0.1"].includes(e.SMTP_HOST);
}

/** Mail that could not be sent in the last day: how many times, the latest kind, the server's words and when. */
export async function recentMailFailures(now = new Date()) {
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const [count, last] = await Promise.all([db.mailFailure.count({ where: { at: { gte: since } } }).catch(() => 0), db.mailFailure.findFirst({ where: { at: { gte: since } }, orderBy: { at: "desc" } }).catch(() => null)]);
  return { count, last: last ? { kind: last.kind, code: last.code, detail: last.detail, at: last.at.toISOString() } : null };
}

/** `seen` and `hints` are for the mail check only: what the site sees in its settings (no password) and what looks wrong in it. */
export type SetupCheck = { ok: boolean; code: string; detail?: string | null; seen?: string; hints?: string[] };

/**
 * A quick check of one service. It answers with a code that the page turns into plain words. Google and Slack can only be checked fully by
 * a real connection, so here their keys are checked for being there and looking right.
 */
export async function testPlatformProvider(userId: string, provider: Provider): Promise<SetupCheck> {
  await requireSuperAdmin(userId);
  const e = env();
  const https = appUrl().startsWith("https://");
  switch (provider) {
    case "mail": {
      if (!mailConfigured()) return { ok: false, code: "mail_config" };
      const me = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!me) return { ok: false, code: "mail_unknown" };
      try {
        const sent = await sendMail({ to: me.email, subject: "MLM CRM: test", text: "The e-mail of MLM CRM works.", html: "<p>The e-mail of MLM CRM works.</p>" }, { waits: [] });
        // It arrived, but not the way it should: the first choice (Resend) refused and the mailbox took over. Said plainly, with Resend's own words.
        if (sent?.fellBackFrom) {
          const h = mailSettingsHints(e);
          return { ok: false, code: "mail_fallback", detail: sent.fellBackFrom, seen: h.seen, hints: h.codes };
        }
        return { ok: true, code: sent?.via === "resend" ? "mail_ok_resend" : "mail_ok", detail: me.email };
      } catch (err) {
        const info = (err as { info?: ReturnType<typeof classifyMailError> }).info ?? classifyMailError(err);
        const h = mailSettingsHints(e);
        return { ok: false, code: `mail_${info.kind}`, detail: info.detail, seen: h.seen, hints: h.codes };
      }
    }
    case "googleSignIn": {
      if (!https) return { ok: false, code: "https" };
      if (!set(e.AUTH_GOOGLE_ID) || !set(e.AUTH_GOOGLE_SECRET)) return { ok: false, code: "googleSignIn_keys" };
      if (!/\.apps\.googleusercontent\.com$/.test((e.AUTH_GOOGLE_ID ?? "").trim())) return { ok: false, code: "googleSignIn_id" };
      return { ok: true, code: "googleSignIn_ok" };
    }
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
