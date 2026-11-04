import nodemailer from "nodemailer";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { classifyMailError, isRetryable, MailError } from "./errors";

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

async function sendOnce(mail: Mail): Promise<void> {
  const e = env();
  if (e.RESEND_API_KEY) {
    const { error } = await new Resend(e.RESEND_API_KEY).emails.send({ from: e.MAIL_FROM, ...mail });
    if (error) throw Object.assign(new Error(`Resend: ${error.message}`), { code: null });
    return;
  }
  const auth = e.SMTP_USER && e.SMTP_PASS ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined;
  const secure = e.SMTP_SECURE ?? e.SMTP_PORT === 465;
  const transport = nodemailer.createTransport({ host: e.SMTP_HOST, port: e.SMTP_PORT, secure, auth, requireTLS: !!auth && !secure, connectionTimeout: 10_000, socketTimeout: 15_000 });
  await transport.sendMail({ from: e.MAIL_FROM, ...mail });
}

/**
 * Resend when RESEND_API_KEY is set; otherwise SMTP: Mailpit locally, or a real mailbox (e.g. Gmail with an app password) when SMTP_USER and SMTP_PASS are set.
 * A failure that may pass (the server unreachable, asked to wait) is tried again twice; one that will not (a refused password) is not.
 * Every failure is written to the log with the server's own words and kept for the platform owner (see `recordMailFailure`), and thrown as a `MailError`.
 */
export async function sendMail(mail: Mail, opts: { waits?: readonly number[] } = {}): Promise<void> {
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
      console.error(`[mail] not sent: ${info.kind} ${info.code ?? ""} ${info.detail}`);
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
