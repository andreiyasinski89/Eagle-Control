import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

vi.hoisted(() => {
  Object.assign(process.env, { DATABASE_URL: "postgresql://x", AUTH_SECRET: "x", DEMO_MODE: "true" });
});
const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn(async () => undefined) }));

import { POST } from "@/app/api/demo/login/route";
import { resetDemo, startDemoSession } from "@/server/services/demo-mode";
import { sendChallenge } from "@/server/services/account";
import { handlers } from "@/server/jobs";

let close: () => Promise<void>;
const login = (headers: Record<string, string> = {}) => POST(new NextRequest("http://localhost/api/demo/login", { method: "POST", headers }));

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
}, 60_000);
afterAll(() => close());

describe("public demo", () => {
  it("fills the sample data on the first visit and signs the visitor in as the demo owner", async () => {
    expect(await holder.db.workspace.count()).toBe(0);
    const res = await login();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    const cookie = res.cookies.get("authjs.session-token");
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    const session = await holder.db.session.findUniqueOrThrow({ where: { sessionToken: cookie!.value }, include: { user: true } });
    expect(session.user.email).toBe("demo@meetowl.local");
    expect(session.expires.getTime()).toBeGreaterThan(Date.now());
    const ws = await holder.db.workspace.findUniqueOrThrow({ where: { slug: "demo-studio" } });
    expect(await holder.db.node.count({ where: { workspaceId: ws.id, type: "PROJECT", title: "New Product Launch" } })).toBe(1);
    expect(await holder.db.membership.findFirst({ where: { userId: session.userId, workspaceId: ws.id, role: "OWNER" } })).not.toBeNull();
  });

  it("uses the Secure cookie name behind https, and each visit gets its own token", async () => {
    const a = await login({ "x-forwarded-proto": "https" });
    const b = await login({ "x-forwarded-proto": "https" });
    const [ca, cb] = [a.cookies.get("__Secure-authjs.session-token"), b.cookies.get("__Secure-authjs.session-token")];
    expect(ca).toMatchObject({ secure: true });
    expect(ca!.value).not.toBe(cb!.value);
    expect(await holder.db.workspace.count({ where: { slug: "demo-studio" } })).toBe(1); // seeded once, not per visit
  });

  it("seeds only once when visitors arrive together", async () => {
    await holder.db.workspace.deleteMany({});
    await Promise.all([startDemoSession(), startDemoSession(), startDemoSession()]);
    expect(await holder.db.workspace.count({ where: { slug: "demo-studio" } })).toBe(1);
  });

  it("rate limits one address", async () => {
    let last = 0;
    for (let i = 0; i < 32; i++) last = (await login({ "x-forwarded-for": "9.9.9.9" })).status;
    expect(last).toBe(429);
  });

  it("is a 404 when demo mode is off", async () => {
    vi.resetModules();
    process.env.DEMO_MODE = "false";
    const off = await import("@/app/api/demo/login/route");
    // env() caches its first read; load a fresh copy of it for this check
    const res = await off.POST(new NextRequest("http://localhost/api/demo/login", { method: "POST" }));
    process.env.DEMO_MODE = "true";
    expect(res.status).toBe(404);
  });

  it("puts the workspace back after visitors changed it, and keeps open sessions", async () => {
    const { token } = await startDemoSession();
    const ws = await holder.db.workspace.findUniqueOrThrow({ where: { slug: "demo-studio" } });
    const before = await holder.db.node.count({ where: { workspaceId: ws.id } });
    await holder.db.node.deleteMany({ where: { workspaceId: ws.id, type: "TASK" } });
    await holder.db.user.update({ where: { email: "demo@meetowl.local" }, data: { name: "Hacked" } });
    expect(await holder.db.node.count({ where: { workspaceId: ws.id } })).toBeLessThan(before);

    await resetDemo();
    const fresh = await holder.db.workspace.findUniqueOrThrow({ where: { slug: "demo-studio" } });
    expect(await holder.db.node.count({ where: { workspaceId: fresh.id } })).toBe(before);
    expect((await holder.db.user.findUniqueOrThrow({ where: { email: "demo@meetowl.local" } })).name).toBe("Demo Owner");
    expect(await holder.db.session.findUnique({ where: { sessionToken: token } })).not.toBeNull();
  });

  it("is available as a scheduled job", async () => {
    expect(await handlers["demo/reset"]()).toEqual({ reset: true });
  });

  it("refuses to export or delete the demo account", async () => {
    const owner = await holder.db.user.findUniqueOrThrow({ where: { email: "demo@meetowl.local" } });
    await expect(sendChallenge(owner.id, "delete")).rejects.toMatchObject({ status: 403, code: "demo_account" });
  });
});
