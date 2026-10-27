import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.hoisted(() => {
  Object.assign(process.env, { DATABASE_URL: "postgresql://x", AUTH_SECRET: "x" });
});
const smtp = vi.hoisted(() => ({ options: [] as Record<string, unknown>[], sent: [] as unknown[] }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: (o: Record<string, unknown>) => {
      smtp.options.push(o);
      return { sendMail: async (m: unknown) => void smtp.sent.push(m) };
    },
  },
}));
const auth = vi.hoisted(() => ({ posts: 0 }));
vi.mock("@/server/auth", () => ({ handlers: { GET: async () => new Response("ok"), POST: async () => (auth.posts++, new Response("sent")) } }));
vi.mock("@/server/services/signin-guard", () => ({ allowSignIn: vi.fn(async () => ({ ok: true })) }));

import { confirmLink } from "@/server/auth/confirm-link";
import { isSignInTarget } from "@/server/http/signin-target";
import { POST as confirmPost } from "@/app/api/signin-confirm/route";
import { POST as authPost } from "@/app/api/auth/[...nextauth]/route";
import { sendMail } from "@/server/mail";

afterEach(() => vi.unstubAllEnvs());

const real = "https://app.example.com/api/auth/callback/email?callbackUrl=https%3A%2F%2Fapp.example.com%2F&token=abc&email=a%40b.io";

describe("the e-mailed sign-in link", () => {
  it("points at the confirmation page, carrying only the path of the real link", () => {
    const link = new URL(confirmLink(real));
    expect(link.origin).toBe("https://app.example.com");
    expect(link.pathname).toBe("/sign-in/confirm");
    const next = link.searchParams.get("next")!;
    expect(next.startsWith("/api/auth/callback/email?")).toBe(true);
    expect(next).toContain("token=abc");
    expect(isSignInTarget(next)).toBe(true);
  });

  it("refuses to mail a link to localhost in production (AUTH_URL not set)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => confirmLink("http://localhost:3000/api/auth/callback/email?token=x")).toThrow(/AUTH_URL/);
    expect(() => confirmLink(real)).not.toThrow();
  });

  it("allows localhost links in development", () => {
    expect(() => confirmLink("http://localhost:3000/api/auth/callback/email?token=x")).not.toThrow();
  });
});

describe("the confirmation button's target", () => {
  it("accepts only the Auth.js e-mail callback", () => {
    expect(isSignInTarget("/api/auth/callback/email?token=1&email=a%40b.io")).toBe(true);
    for (const bad of ["", "https://evil.example/x", "//evil.example", "/api/auth/callback/google?x=1", "/api/auth/callback/email", "/api/auth/callback/email?x=1\\evil", "/api/auth/callback/email?x=//evil", "/api/auth/callback/email?x=1\r\nSet-Cookie: a=b", "/w/demo"]) expect(isSignInTarget(bad), bad).toBe(false);
  });

  const post = (next: string) => {
    const body = new FormData();
    body.set("next", next);
    return confirmPost(new NextRequest("http://localhost/api/signin-confirm", { method: "POST", body }));
  };

  it("forwards a good link with a 303 and nothing else", async () => {
    const res = await post("/api/auth/callback/email?token=1&email=a%40b.io");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/api/auth/callback/email?token=1&email=a%40b.io");
  });

  it("refuses anything else, so it cannot redirect elsewhere", async () => {
    expect((await post("https://evil.example")).status).toBe(400);
    expect((await confirmPost(new NextRequest("http://localhost/api/signin-confirm", { method: "POST" }))).status).toBe(400);
  });
});

describe("requesting a sign-in link", () => {
  const request = (fields: Record<string, string>, ip = "1.1.1.1") => {
    const body = new URLSearchParams(fields);
    return authPost(new NextRequest("http://localhost/api/auth/signin/email", { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip } }));
  };

  it("needs the terms to be agreed, and only then reaches Auth.js", async () => {
    expect((await request({ email: "terms1@x.io" }, "2.2.2.2")).status).toBe(400);
    expect((await request({ email: "terms1@x.io", terms: "0" }, "2.2.2.2")).status).toBe(400);
    expect(auth.posts).toBe(0);
    expect((await request({ email: "terms1@x.io", terms: "1" }, "2.2.2.2")).status).toBe(200);
    expect(auth.posts).toBe(1);
  });

  it("sends nothing to a bot that filled the hidden field, and says it was sent", async () => {
    const before = auth.posts;
    const res = await request({ email: "bot@x.io", terms: "1", website: "http://spam.example" }, "3.3.3.3");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "/sign-in?sent=1" });
    expect(auth.posts).toBe(before);
  });

  it("refuses a temporary mailbox, and lets the same request through with a real one", async () => {
    const before = auth.posts;
    const res = await request({ email: "x@mailinator.com", terms: "1" }, "4.4.4.4");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("disposable_email");
    expect(auth.posts).toBe(before);
    expect((await request({ email: "x@gmail.com", terms: "1" }, "4.4.4.4")).status).toBe(200);
    expect(auth.posts).toBe(before + 1);
  });
});

describe("the mail transport", () => {
  const mail = { to: "a@b.io", subject: "s", text: "t", html: "<p>t</p>" };
  const lastOptions = async (env: Record<string, string>) => {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const { sendMail: fresh } = await import("@/server/mail");
    smtp.options.length = 0;
    await fresh(mail);
    return smtp.options[0]!;
  };

  it("stays plain for a local catcher with no login", async () => {
    expect(await lastOptions({ SMTP_HOST: "localhost", SMTP_PORT: "1025" })).toMatchObject({ host: "localhost", port: 1025, secure: false, requireTLS: false });
    expect((await lastOptions({ SMTP_HOST: "localhost", SMTP_PORT: "1025" })).auth).toBeUndefined();
  });

  it("uses TLS from the start on port 465 and logs in (Gmail)", async () => {
    expect(await lastOptions({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "465", SMTP_USER: "me@gmail.com", SMTP_PASS: "app-password" })).toMatchObject({ secure: true, auth: { user: "me@gmail.com", pass: "app-password" } });
  });

  it("requires STARTTLS on port 587 when a login is set, so the password never goes in the clear", async () => {
    expect(await lastOptions({ SMTP_HOST: "smtp.gmail.com", SMTP_PORT: "587", SMTP_USER: "me@gmail.com", SMTP_PASS: "app-password" })).toMatchObject({ secure: false, requireTLS: true });
  });

  it("gives up on a silent server instead of hanging", async () => {
    const o = await lastOptions({ SMTP_HOST: "h", SMTP_PORT: "465" });
    expect(o.connectionTimeout).toBeLessThanOrEqual(10_000);
    expect(o.socketTimeout).toBeLessThanOrEqual(15_000);
    expect(sendMail).toBeTypeOf("function");
  });
});
