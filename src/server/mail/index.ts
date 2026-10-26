import nodemailer from "nodemailer";
import { Resend } from "resend";
import { env } from "@/lib/env";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Resend when RESEND_API_KEY is set (production); SMTP otherwise (Mailpit locally). */
export async function sendMail(mail: Mail): Promise<void> {
  const e = env();
  if (e.RESEND_API_KEY) {
    const { error } = await new Resend(e.RESEND_API_KEY).emails.send({ from: e.MAIL_FROM, ...mail });
    if (error) throw new Error(`Resend: ${error.message}`);
    return;
  }
  const transport = nodemailer.createTransport({ host: e.SMTP_HOST, port: e.SMTP_PORT, secure: false });
  await transport.sendMail({ from: e.MAIL_FROM, ...mail });
}
