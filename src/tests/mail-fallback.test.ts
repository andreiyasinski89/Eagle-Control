import { afterEach, describe, expect, it, vi } from "vitest";

/** The first choice is Resend; if it refuses and a mailbox is set up beside it, the mail goes through the mailbox. */
const mail = { to: "p@gmail.com", subject: "s", text: "t", html: "h" };

async function setup(opts: { resend?: string; smtp: boolean; resendError?: string }) {
  vi.resetModules();
  const smtp = vi.fn().mockResolvedValue(undefined);
  const resend = vi.fn().mockResolvedValue(opts.resendError ? { error: { message: opts.resendError } } : { data: { id: "1" }, error: null });
  vi.doMock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: smtp }) } }));
  vi.doMock("resend", () => ({ Resend: class { emails = { send: resend }; } }));
  vi.doMock("@/lib/env", () => ({ env: () => ({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: 465, MAIL_FROM: "MLM CRM <noreply@mlmcrm.app>", SMTP_SECURE: true, RESEND_API_KEY: opts.resend, ...(opts.smtp ? { SMTP_USER: "me@gmail.com", SMTP_PASS: "abcdefghijklmnop" } : {}) }) }));
  vi.doMock("@/server/db", () => ({ db: { mailFailure: { create: async () => undefined } } }));
  const { sendMail } = await import("@/server/mail");
  return { sendMail, smtp, resend };
}

afterEach(() => {
  for (const m of ["nodemailer", "resend", "@/lib/env", "@/server/db"]) vi.doUnmock(m);
  vi.restoreAllMocks();
});

describe("Resend first, the mailbox as the way back", () => {
  it("goes through Resend when it works, and the mailbox is left alone", async () => {
    const { sendMail, smtp, resend } = await setup({ resend: "re_key", smtp: true });
    expect(await sendMail(mail, { waits: [] })).toEqual({ via: "resend" });
    expect(resend).toHaveBeenCalledWith(expect.objectContaining({ from: "MLM CRM <noreply@mlmcrm.app>", to: "p@gmail.com" }));
    expect(smtp).not.toHaveBeenCalled();
  });

  it("goes through the mailbox when Resend refuses (the domain not verified yet), and says why", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { sendMail, smtp } = await setup({ resend: "re_key", smtp: true, resendError: "The mlmcrm.app domain is not verified" });
    const r = await sendMail(mail, { waits: [] });
    expect(r.via).toBe("smtp");
    expect(r.fellBackFrom).toContain("not verified");
    expect(smtp).toHaveBeenCalledTimes(1);
  });

  it("with Resend alone and no mailbox there is no way back: the failure is told as it is", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { sendMail, smtp } = await setup({ resend: "re_key", smtp: false, resendError: "The API key is invalid" });
    await expect(sendMail(mail, { waits: [] })).rejects.toMatchObject({ name: "MailError", info: { kind: "credentials" } });
    expect(smtp).not.toHaveBeenCalled();
  });

  it("without Resend it is the mailbox, as before", async () => {
    const { sendMail, smtp, resend } = await setup({ smtp: true });
    expect(await sendMail(mail, { waits: [] })).toEqual({ via: "smtp" });
    expect(smtp).toHaveBeenCalledTimes(1);
    expect(resend).not.toHaveBeenCalled();
  });
});
