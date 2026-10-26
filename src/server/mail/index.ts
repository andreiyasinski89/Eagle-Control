import nodemailer from "nodemailer";
import { Resend } from "resend";
import { env } from "@/lib/env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Resend when RESEND_API_KEY is set; otherwise SMTP: Mailpit locally, or a real mailbox (e.g. Gmail with an app password) when SMTP_USER and SMTP_PASS are set. */
export async function sendMail(mail: Mail): Promise<void> {
  const e = env();
  if (e.RESEND_API_KEY) {
    const { error } = await new Resend(e.RESEND_API_KEY).emails.send({ from: e.MAIL_FROM, ...mail });
    if (error) throw new Error(`Resend: ${error.message}`);
    return;
  }
  const auth = e.SMTP_USER && e.SMTP_PASS ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined;
  const secure = e.SMTP_SECURE ?? e.SMTP_PORT === 465;
  const transport = nodemailer.createTransport({ host: e.SMTP_HOST, port: e.SMTP_PORT, secure, auth, requireTLS: !!auth && !secure, connectionTimeout: 10_000, socketTimeout: 15_000 });
  await transport.sendMail({ from: e.MAIL_FROM, ...mail });
}
