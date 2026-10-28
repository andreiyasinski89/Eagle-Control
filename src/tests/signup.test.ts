import { describe, expect, it } from "vitest";
import { cleanName, emailDomain, isDisposableEmail, isRefCode, parseRefCode } from "@/modules/auth/signup";
import { signInMail, welcomeMail } from "@/server/auth/mail-texts";

describe("temporary mailboxes", () => {
  it("knows the throw-away domains and their subdomains, in any case", () => {
    for (const e of ["a@mailinator.com", "A@Mailinator.COM", "x@10minutemail.com", "x@sub.guerrillamail.com", "me@yopmail.com"]) expect(isDisposableEmail(e), e).toBe(true);
  });
  it("lets real addresses through", () => {
    for (const e of ["a@gmail.com", "andrei@meetowl.app", "x@mail.example.com", "x@notmailinator.com", "bad", ""]) expect(isDisposableEmail(e), e).toBe(false);
  });
  it("reads the domain", () => expect(emailDomain(" Me@Example.COM ")).toBe("example.com"));
});

describe("invitation codes", () => {
  it("are lower-case letters and digits, 8 to 16", () => {
    expect(isRefCode("abcd2345xy")).toBe(true);
    for (const v of ["short", "UPPERCASE12", "has-dash-12", "x".repeat(17), "", null, 5]) expect(isRefCode(v), String(v)).toBe(false);
  });
  it("are read from a bare code or from a link", () => {
    expect(parseRefCode("abcd2345xy")).toBe("abcd2345xy");
    expect(parseRefCode(" https://app.meetowl.app/r/abcd2345xy ")).toBe("abcd2345xy");
    expect(parseRefCode("https://app.meetowl.app/r/abcd2345xy/?x=1")).toBe("abcd2345xy");
    expect(parseRefCode("https://app.meetowl.app/other")).toBeNull();
    expect(parseRefCode(null)).toBeNull();
  });
});

describe("names", () => {
  it("are tidied and cut", () => {
    expect(cleanName("  Anna   Maria ")).toBe("Anna Maria");
    expect(cleanName("   ")).toBeNull();
    expect(cleanName(null)).toBeNull();
    expect(cleanName("x".repeat(80))).toHaveLength(60);
  });
});

describe("the e-mails", () => {
  it("the sign-in e-mail speaks the language of the page and carries the link", () => {
    for (const l of ["en", "ru", "pl", "uk"] as const) {
      const m = signInMail(l, "https://x.io/sign-in/confirm?next=a%26b");
      expect(m.text).toContain("https://x.io/sign-in/confirm");
      expect(m.html).toContain("https://x.io/sign-in/confirm?next=a%26b");
    }
    expect(signInMail("ru", "https://x.io/").subject).toBe("Вход в MeetOwl");
    expect(signInMail("uk", "https://x.io/").subject).toBe("Вхід до MeetOwl");
    expect(signInMail("en", "https://x.io/").subject).toBe("Sign in to MeetOwl");
  });
  it("the welcome e-mail has three steps, the start link, and shows no markup typed in a name", () => {
    const m = welcomeMail("ru", "<b>Анна</b>", "Моя <команда>", "https://x.io/w/a/start");
    expect(m.text).toContain("1. ");
    expect(m.text).toContain("3. ");
    expect(m.text).toContain("https://x.io/w/a/start");
    expect(m.html).not.toContain("<b>Анна</b>");
    expect(m.html).toContain("&lt;b&gt;");
    expect(welcomeMail("en", null, "Acme", "https://x.io/").text).toContain("Hello!");
  });
});
