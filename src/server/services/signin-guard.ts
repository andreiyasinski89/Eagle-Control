import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { db } from "@/server/db";

const DAY = 86_400_000;
/** Sign-in e-mails one address of the caller may ask for per day, and one mailbox may receive per day. */
// A presentation or a team meeting brings many people from one network: the limit per address has to leave room for them.
export const PER_IP_DAILY = 100;
export const PER_MAILBOX_DAILY = 10;

export type SignInVerdict = { ok: true } | { ok: false; reason: "ip" | "mailbox" | "global" };

const hash = (kind: string, value: string) => createHash("sha256").update(`${kind}:${env().AUTH_SECRET}:${value}`).digest("hex");

/**
 * The daily limits on sign-in e-mails, kept in the database so they hold however many servers run (the per-minute limits in
 * memory do not). They protect three things: a stranger's mailbox from a flood of links, the service from being used to
 * send e-mail for someone else, and the sending account's own daily quota (Gmail blocks the account when it is exceeded).
 * Only salted hashes are stored. An allowed request is recorded.
 */
export async function allowSignIn(ip: string, email: string, now = new Date()): Promise<SignInVerdict> {
  const ipHash = hash("ip", ip);
  const mailHash = hash("mail", email.trim().toLowerCase());
  const since = new Date(now.getTime() - DAY);
  const [byIp, byMailbox, total] = await Promise.all([
    db.signInAttempt.count({ where: { ipHash, at: { gt: since } } }),
    db.signInAttempt.count({ where: { mailHash, at: { gt: since } } }),
    db.signInAttempt.count({ where: { at: { gt: since } } }),
  ]);
  if (byIp >= PER_IP_DAILY) return { ok: false, reason: "ip" };
  if (byMailbox >= PER_MAILBOX_DAILY) return { ok: false, reason: "mailbox" };
  if (total >= env().MAIL_DAILY_LIMIT) return { ok: false, reason: "global" };
  await db.signInAttempt.create({ data: { ipHash, mailHash, at: now } });
  return { ok: true };
}
