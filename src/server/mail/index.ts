import nodemailer from "nodemailer";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { classifyMailError, isRetryable, MailError } from "./errors";
import { mailSettingsHints } from "./hints";

export { MailError } from "./errors";
export type { MailFailureKind } from "./errors";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Waits between the tries of one mail (milliseconds). Short on purpose: a person is waiting for the link. */
const WAITS = [700, 1800];
const nap = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** How a mail went out: through which service, and, when the first choice refused it, why the other one was used. */
export interface MailSent {
  via: "resend" | "smtp";
  fellBackFrom?: string;
}

async function sendResend(mail: Mail, key: string, from: string): Promise<void> {
  const { error } = await new Resend(key).emails.send({ from, ...mail });
  if (error) throw Object.assign(new Error(`Resend: ${error.message}`), { code: null });
}

async function sendSmtp(mail: Mail): Promise<void> {
  const e = env();
  const auth = e.SMTP_USER && e.SMTP_PASS ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined;
  const secure = e.SMTP_SECURE ?? e.SMTP_PORT === 465;
  const transport = nodemailer.createTransport({ host: e.SMTP_HOST, port: e.SMTP_PORT, secure, auth, requireTLS: !!auth && !secure, connectionTimeout: 10_000, socketTimeout: 15_000 });
  await transport.sendMail({ from: e.MAIL_FROM, ...mail });
}

async function sendOnce(mail: Mail): Promise<MailSent> {
  const e = env();
  if (e.RESEND_API_KEY?.trim()) {
    try {
      await sendResend(mail, e.RESEND_API_KEY, e.MAIL_FROM);
      return { via: "resend" };
    } catch (err) {
      // Resend is the first choice, but a mailbox set up beside it is not left unused: if Resend refuses (the domain is not verified yet, the key is wrong,
      // the service is down), the mail goes through the mailbox, so adding Resend can never cost the people their sign-in links.
      if (!(e.SMTP_USER && e.SMTP_PASS)) throw err;
      const why = classifyMailError(err);
      console.warn(`[mail] Resend refused (${why.kind} ${why.code ?? ""} ${why.detail}); sending through the mailbox instead`);
      await sendSmtp(mail);
      return { via: "smtp", fellBackFrom: why.detail };
    }
  }
  await sendSmtp(mail);
  return { via: "smtp" };
}

/**
 * Resend when RESEND_API_KEY is set (and, if Resend refuses and a mailbox is set up too, the mailbox instead); otherwise SMTP: Mailpit locally, or a real mailbox (e.g. Gmail with an app password) when SMTP_USER and SMTP_PASS are set.
 * A failure that may pass (the server unreachable, asked to wait) is tried again twice; one that will not (a refused password) is not.
 * Every failure is written to the log with the server's own words and kept for the platform owner (see `recordMailFailure`), and thrown as a `MailError`.
 */
export async function sendMail(mail: Mail, opts: { waits?: readonly number[] } = {}): Promise<MailSent> {
  const waits = opts.waits ?? (process.env.NODE_ENV === "test" ? [] : WAITS);
  for (let attempt = 0; ; attempt++) {
    try {
      return await sendOnce(mail);
    } catch (e) {
      const info = classifyMailError(e);
      const wait = waits[attempt];
      if (wait !== undefined && isRetryable(info.kind)) {
        await nap(wait);
        continue;
      }
      // With the server's own words, what the site sees in its mail settings (the login half hidden, the length of the password, never the password)
      // and what looks wrong in them: enough to find a mistake in the settings from the log alone, when nobody can sign in to look at the admin page.
      const h = mailSettingsHints(env());
      console.error(`[mail] not sent: ${info.kind} ${info.code ?? ""} ${info.detail} | settings: ${h.seen} | check: ${h.codes.join(",") || "nothing looks wrong"}`);
      await recordMailFailure(info, mail.to);
      throw new MailError(info);
    }
  }
}

/** Kept without the address (only its domain), so the owner can see that and why mail stopped without a list of who tried. */
async function recordMailFailure(info: { kind: string; code: string | null; detail: string }, to: string): Promise<void> {
  try {
    await db.mailFailure.create({ data: { kind: info.kind, code: info.code, detail: info.detail.slice(0, 300), toDomain: to.split("@")[1]?.toLowerCase().slice(0, 100) ?? null } });
  } catch {
    /* the log is a help, never a reason for a second failure */
  }
}
