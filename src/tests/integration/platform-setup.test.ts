import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://x",
    AUTH_SECRET: "x",
    SUPERADMIN_EMAILS: "boss@example.com",
    APP_URL: "https://app.example.com",
    TELEGRAM_BOT_TOKEN: "tg-token-123456",
    TELEGRAM_BOT_USERNAME: "MeetOwlBot",
    TELEGRAM_WEBHOOK_SECRET: "hook-secret-value",
    GOOGLE_CAL_CLIENT_ID: "123-abc.apps.googleusercontent.com",
    GOOGLE_CAL_CLIENT_SECRET: "GOCSPX-very-secret",
    AUTH_GOOGLE_ID: "1-abc.apps.googleusercontent.com",
    AUTH_GOOGLE_SECRET: "GOCSPX-signin-secret",
    SMTP_HOST: "smtp.gmail.com",
    SMTP_USER: "me@gmail.com",
    SMTP_PASS: "app-password-secret",
  });
});
const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn() }));

import { sendMail } from "@/server/mail";
import { MailError } from "@/server/mail/errors";
import { connectTelegramBot, getPlatformSetup, recentMailFailures, testPlatformProvider } from "@/server/services/platform-setup";

let close: () => Promise<void>;
let boss: string;
let other: string;
/** The address Telegram currently sends this bot's messages to (set by a fake setWebhook). */
let hookUrl = "";
const calls: string[] = [];

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  boss = (await t.db.user.create({ data: { email: "boss@example.com", name: "Boss" } })).id;
  other = (await t.db.user.create({ data: { email: "o@x.io", name: "Other" } })).id;
  // A fake Telegram: who the bot is, where its messages go, and a way to set that.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      calls.push(u);
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      if (u.endsWith("/getMe")) return json({ ok: true, result: { username: "MeetOwlBot" } });
      if (u.endsWith("/getWebhookInfo")) return json({ ok: true, result: { url: hookUrl } });
      if (u.endsWith("/setWebhook")) {
        hookUrl = (JSON.parse(String(init?.body)) as { url: string }).url;
        return json({ ok: true, result: true });
      }
      return json({ ok: true });
    }),
  );
}, 120_000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await close();
});

describe("platform setup", () => {
  it("is for the platform owner only: for everyone else it does not exist", async () => {
    await expect(getPlatformSetup(other)).rejects.toMatchObject({ status: 404 });
    await expect(testPlatformProvider(other, "telegram")).rejects.toMatchObject({ status: 404 });
    await expect(connectTelegramBot(other)).rejects.toMatchObject({ status: 404 });
  });

  it("says what is ready and what is missing, gives the addresses to paste, and never shows a key", async () => {
    const s = await getPlatformSetup(boss);
    const by = Object.fromEntries(s.providers.map((p) => [p.id, p]));
    expect(s).toMatchObject({ appUrl: "https://app.example.com", https: true });
    expect(by.mail?.ready).toBe(true);
    expect([by.inngest?.ready, by.telegram?.ready, by.google?.ready, by.slack?.ready, by.claude?.ready]).toEqual([false, true, true, false, true]);
    expect(by.google?.values).toEqual([{ key: "redirectUri", value: "https://app.example.com/api/integrations/google/callback" }]);
    expect(by.telegram?.values[0]?.value).toBe("https://app.example.com/api/integrations/telegram/webhook");
    expect(by.claude?.values[0]?.value).toBe("https://app.example.com/api/mcp");
    expect(by.slack?.vars.map((v) => [v.name, v.set])).toEqual([["SLACK_CLIENT_ID", false], ["SLACK_CLIENT_SECRET", false], ["SLACK_SIGNING_SECRET", false]]);
    // only whether a setting is there: none of the secret values is in the answer
    const text = JSON.stringify(s);
    for (const secret of ["tg-token-123456", "hook-secret-value", "GOCSPX-very-secret", "app-password-secret"]) expect(text).not.toContain(secret);
  });

  it("tests Telegram: the token is real, the bot named right, and the messages must go here, which one press sets", async () => {
    hookUrl = "";
    expect(await testPlatformProvider(boss, "telegram")).toMatchObject({ ok: false, code: "telegram_webhook" });
    expect(await connectTelegramBot(boss)).toEqual({ url: "https://app.example.com/api/integrations/telegram/webhook" });
    expect(await testPlatformProvider(boss, "telegram")).toEqual({ ok: true, code: "telegram_ok", detail: "MeetOwlBot" });
    expect(calls.some((c) => c.endsWith("/setWebhook"))).toBe(true);
  });

  it("tests the others by their keys: Google looks right, Slack and Inngest are missing, Claude only needs https", async () => {
    expect(await testPlatformProvider(boss, "google")).toEqual({ ok: true, code: "google_ok" });
    expect(await testPlatformProvider(boss, "slack")).toEqual({ ok: false, code: "slack_keys" });
    expect(await testPlatformProvider(boss, "inngest")).toEqual({ ok: false, code: "inngest_keys" });
    expect(await testPlatformProvider(boss, "claude")).toEqual({ ok: true, code: "claude_ok" });
  });

  it("tests the mail: a test e-mail to the owner, and when it fails the owner is told why, in the server's own words", async () => {
    const send = vi.mocked(sendMail);
    send.mockResolvedValueOnce({ via: "smtp" });
    expect(await testPlatformProvider(boss, "mail")).toEqual({ ok: true, code: "mail_ok", detail: "boss@example.com" });
    // through Resend
    send.mockResolvedValueOnce({ via: "resend" });
    expect(await testPlatformProvider(boss, "mail")).toEqual({ ok: true, code: "mail_ok_resend", detail: "boss@example.com" });
    // it arrived, but Resend refused and the mailbox took over: said, with Resend's words
    send.mockResolvedValueOnce({ via: "smtp", fellBackFrom: "Resend: The mlmcrm.app domain is not verified" });
    expect(await testPlatformProvider(boss, "mail")).toEqual({ ok: false, code: "mail_fallback", detail: "Resend: The mlmcrm.app domain is not verified" });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ to: "boss@example.com" }), { waits: [] });
    send.mockRejectedValueOnce(new MailError({ kind: "credentials", code: "535", detail: "535 5.7.8 BadCredentials" }));
    const bad = await testPlatformProvider(boss, "mail");
    expect(bad).toMatchObject({ ok: false, code: "mail_credentials", detail: "535 5.7.8 BadCredentials" });
    // and what looks wrong in the settings, without the password: here it is not 16 letters and the port is not Gmail's
    expect(bad.hints).toEqual(["pass_length", "port_not_gmail"]);
    expect(bad.seen).toBe("smtp.gmail.com:1025 · me***@gmail.com · 19");
    expect(JSON.stringify(bad)).not.toContain("app-password-secret");
    send.mockRejectedValueOnce(new Error("socket hang up"));
    expect(await testPlatformProvider(boss, "mail")).toMatchObject({ ok: false, code: "mail_network" });
  });

  it("shows the failed sends of the last day, and a mail that keeps failing is not 'ready'", async () => {
    const db = holder.db;
    await db.mailFailure.deleteMany({});
    expect(await recentMailFailures()).toEqual({ count: 0, last: null });
    await db.mailFailure.create({ data: { kind: "credentials", code: "535", detail: "BadCredentials", toDomain: "gmail.com", at: new Date(Date.now() - 2 * 86_400_000) } });
    expect((await recentMailFailures()).count).toBe(0); // two days old: forgotten
    await db.mailFailure.create({ data: { kind: "credentials", code: "535", detail: "BadCredentials", toDomain: "gmail.com" } });
    const s = await getPlatformSetup(boss);
    expect(s.mailFailures).toMatchObject({ count: 1, last: { kind: "credentials", code: "535" } });
    expect(s.providers.find((p) => p.id === "mail")?.ready).toBe(false);
    expect(JSON.stringify(s)).not.toContain("gmail.com"); // not even the domain of who tried
  });

  it("checks the Google sign-in keys and gives the two addresses to paste", async () => {
    expect(await testPlatformProvider(boss, "googleSignIn")).toEqual({ ok: true, code: "googleSignIn_ok" });
    const by = Object.fromEntries((await getPlatformSetup(boss)).providers.map((p) => [p.id, p]));
    expect(by.googleSignIn?.ready).toBe(true);
    expect(by.googleSignIn?.values).toEqual([{ key: "origin", value: "https://app.example.com" }, { key: "authRedirectUri", value: "https://app.example.com/api/auth/callback/google" }]);
    expect(JSON.stringify(by.googleSignIn)).not.toContain("GOCSPX-signin-secret");
  });
});
