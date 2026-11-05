import { describe, expect, it } from "vitest";
import { mailSettingsHints } from "@/server/mail/hints";

const good = { SMTP_HOST: "smtp.gmail.com", SMTP_PORT: 465, SMTP_USER: "me@gmail.com", SMTP_PASS: "abcdefghijklmnop" };

describe("what looks wrong in the mail settings", () => {
  it("finds nothing wrong in good settings, and shows the address half hidden and no password", () => {
    const h = mailSettingsHints(good);
    expect(h.codes).toEqual([]);
    expect(h.seen).toBe("smtp.gmail.com:465 · me***@gmail.com · 16");
    expect(h.seen).not.toContain("abcdefghijklmnop");
  });

  it("an app password written with spaces is the same password", () => {
    expect(mailSettingsHints({ ...good, SMTP_PASS: "abcd efgh ijkl mnop" }).codes).toEqual(["pass_spaces"]);
  });

  it("the variable's own name typed as its value (the mistake made with the host)", () => {
    expect(mailSettingsHints({ ...good, SMTP_PASS: "SMTP_PASS", SMTP_USER: "SMTP_USER" }).codes).toEqual(["user_is_name", "pass_is_name"]);
  });

  it("the usual password of the account is not an app password, and a wrong length is told", () => {
    expect(mailSettingsHints({ ...good, SMTP_PASS: "MyAccount#2026pass" }).codes).toContain("pass_length");
    expect(mailSettingsHints({ ...good, SMTP_PASS: "Abcdefghijklmnop" }).codes).toEqual(["pass_chars"]);
  });

  it("quotation marks, a stray space or a line break around a value", () => {
    expect(mailSettingsHints({ ...good, SMTP_PASS: '"abcdefghijklmnop"' }).codes).toContain("pass_stray");
    expect(mailSettingsHints({ ...good, SMTP_PASS: "abcdefghijklmnop\n" }).codes).toContain("pass_stray");
    expect(mailSettingsHints({ ...good, SMTP_USER: " me@gmail.com" }).codes).toEqual(["user_stray"]);
    expect(mailSettingsHints({ ...good, SMTP_USER: "me" }).codes).toEqual(["user_not_email"]);
  });

  it("missing values, a Resend key that takes over, a host or port that does not fit Gmail", () => {
    expect(mailSettingsHints({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: 465 }).codes).toEqual(["user_missing", "pass_missing"]);
    // Resend beside a good mailbox is the safe setup (the mailbox is the way back); Resend alone is told as such
    expect(mailSettingsHints({ ...good, RESEND_API_KEY: "re_x" }).codes).toEqual([]);
    expect(mailSettingsHints({ ...good, RESEND_API_KEY: "re_x" }).seen).toContain("Resend");
    expect(mailSettingsHints({ SMTP_HOST: "localhost", SMTP_PORT: 1025, RESEND_API_KEY: "re_x" }).codes).toEqual(["resend_wins"]);
    // Resend refuses a sender at a free mailbox domain: told before the person has to read Resend's refusal
    expect(mailSettingsHints({ ...good, RESEND_API_KEY: "re_x", MAIL_FROM: "MeetOwl <me@gmail.com>" }).codes).toEqual(["from_free"]);
    expect(mailSettingsHints({ ...good, RESEND_API_KEY: "re_x", MAIL_FROM: "MLM CRM <noreply@mlmcrm.app>" }).codes).toEqual([]);
    expect(mailSettingsHints({ ...good, RESEND_API_KEY: "re_x", MAIL_FROM: "MLM CRM <noreply@mlmcrm.app>" }).seen).toContain("from @mlmcrm.app");
    // without Resend the sender may well be the Gmail address
    expect(mailSettingsHints({ ...good, MAIL_FROM: "MLM CRM <me@gmail.com>" }).codes).toEqual([]);
    expect(mailSettingsHints({ ...good, SMTP_HOST: "localhost" }).codes).toEqual(["host_not_gmail"]);
    expect(mailSettingsHints({ ...good, SMTP_PORT: 25 }).codes).toEqual(["port_not_gmail"]);
  });
});
