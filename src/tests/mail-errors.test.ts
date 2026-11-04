import { beforeEach, describe, expect, it, vi } from "vitest";
import { classifyMailError, isRetryable, MailError } from "@/server/mail/errors";
import { noteSignInMailFailure, takeSignInMailFailure } from "@/server/auth/mail-failures";

const smtp = (over: Record<string, unknown>) => Object.assign(new Error("Invalid login"), over);

describe("why a mail was not sent", () => {
  it("a refused password is told apart (the one Gmail gave on the production server)", () => {
    const e = smtp({ code: "EAUTH", responseCode: 535, response: "535-5.7.8 Username and Password not accepted. For more information, go to\n535 5.7.8  https://support.google.com/mail/?p=BadCredentials d75a77b69052 - gsmtp" });
    expect(classifyMailError(e)).toMatchObject({ kind: "credentials", code: "535" });
    expect(classifyMailError(e).detail).toContain("BadCredentials");
    expect(isRetryable("credentials")).toBe(false);
  });

  it("a limit or a request to wait is worth another try, an unreachable server too", () => {
    expect(classifyMailError(smtp({ responseCode: 421, response: "421 4.7.0 Try again later" })).kind).toBe("quota");
    expect(classifyMailError(smtp({ responseCode: 550, response: "550 5.4.5 Daily user sending quota exceeded" })).kind).toBe("quota");
    expect(classifyMailError(smtp({ code: "ETIMEDOUT", message: "Connection timeout" })).kind).toBe("network");
    expect(classifyMailError(smtp({ code: "ECONNREFUSED", message: "connect ECONNREFUSED ::1:1025" })).kind).toBe("network");
    expect(isRetryable("quota")).toBe(true);
    expect(isRetryable("network")).toBe(true);
  });

  it("a message the server will not take, and anything else", () => {
    expect(classifyMailError(smtp({ responseCode: 550, response: "550 5.1.1 The email account that you tried to reach does not exist" })).kind).toBe("rejected");
    expect(classifyMailError(new Error("Resend: The API key is invalid")).kind).toBe("credentials");
    expect(classifyMailError(new Error("something odd")).kind).toBe("unknown");
    expect(classifyMailError(null).kind).toBe("unknown");
  });

  it("a MailError says what and why in its message", () => {
    const err = new MailError({ kind: "credentials", code: "535", detail: "BadCredentials" });
    expect(err.message).toContain("credentials");
    expect(err.message).toContain("BadCredentials");
  });
});

describe("telling the form why the link was not sent", () => {
  beforeEach(() => void takeSignInMailFailure("a@x.io"));

  it("the reason noted for an address is given once, case does not matter", () => {
    noteSignInMailFailure("A@X.io", "credentials");
    expect(takeSignInMailFailure("a@x.IO")).toBe("credentials");
    expect(takeSignInMailFailure("a@x.io")).toBeNull();
  });

  it("an old note is forgotten", () => {
    noteSignInMailFailure("a@x.io", "network", 1_000);
    expect(takeSignInMailFailure("a@x.io", 1_000 + 61_000)).toBeNull();
  });
});

describe("sending", () => {
  it("tries again after a failure that may pass, never after a refused password, and keeps the server's words", async () => {
    vi.resetModules();
    const sendMail = vi.fn();
    const created: { code: string; to: string }[] = [];
    vi.doMock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));
    vi.doMock("resend", () => ({ Resend: class {} }));
    vi.doMock("@/lib/env", () => ({ env: () => ({ SMTP_HOST: "smtp.x", SMTP_PORT: 465, MAIL_FROM: "a <a@x.io>", SMTP_USER: "u", SMTP_PASS: "p", SMTP_SECURE: true }) }));
    vi.doMock("@/server/db", () => ({ db: { mailFailure: { create: async ({ data }: { data: { kind: string; toDomain: string } }) => created.push({ code: data.kind, to: data.toDomain }) } } }));
    const { sendMail: send } = await import("@/server/mail");
    const mail = { to: "p@gmail.com", subject: "s", text: "t", html: "h" };

    sendMail.mockRejectedValueOnce(smtp({ code: "ETIMEDOUT", message: "timeout" })).mockResolvedValueOnce(undefined);
    await send(mail, { waits: [1, 1] });
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(created).toHaveLength(0);

    sendMail.mockReset().mockRejectedValue(smtp({ code: "EAUTH", responseCode: 535, response: "535 BadCredentials" }));
    await expect(send(mail, { waits: [1, 1] })).rejects.toMatchObject({ name: "MailError", info: { kind: "credentials" } });
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(created).toEqual([{ code: "credentials", to: "gmail.com" }]);

    sendMail.mockReset().mockRejectedValue(smtp({ code: "ETIMEDOUT", message: "timeout" }));
    await expect(send(mail, { waits: [1, 1] })).rejects.toMatchObject({ info: { kind: "network" } });
    expect(sendMail).toHaveBeenCalledTimes(3);
    vi.doUnmock("nodemailer");
    vi.doUnmock("@/lib/env");
    vi.doUnmock("@/server/db");
    vi.doUnmock("resend");
  });
});
