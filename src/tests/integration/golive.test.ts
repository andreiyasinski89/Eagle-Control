import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

vi.hoisted(() => {
  Object.assign(process.env, { DATABASE_URL: "postgresql://x", AUTH_SECRET: "x", PRO_OWNER_EMAILS: " Boss@Example.com , other@example.com ", MAIL_DAILY_LIMIT: "40" });
});
const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn(async () => undefined) }));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { getBilling } from "@/server/services/billing";
import { transferOwnership } from "@/server/services/account";
import { grantedEmails, isGrantedEmail, syncGrantedPlans } from "@/server/services/grants";
import { PER_IP_DAILY, PER_MAILBOX_DAILY, allowSignIn } from "@/server/services/signin-guard";
import { maintenance } from "@/server/jobs/tasks";

let close: () => Promise<void>;
const u: Record<string, string> = {};
const plan = async (id: string) => (await holder.db.workspace.findUniqueOrThrow({ where: { id } })).plan;
const HOUR = 3_600_000;

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  for (const [k, email] of Object.entries({ boss: "boss@example.com", other: "OTHER@example.com", plain: "plain@example.com", mate: "mate@example.com" })) u[k] = (await t.db.user.create({ data: { email, name: k } })).id;
}, 60_000);
afterAll(() => close());

describe("Pro for the administrator's addresses", () => {
  it("reads the list ignoring case, spaces and empty items", () => {
    expect(grantedEmails()).toEqual(["boss@example.com", "other@example.com"]);
    expect(isGrantedEmail("BOSS@example.com ")).toBe(true);
    expect(isGrantedEmail("plain@example.com")).toBe(false);
  });

  it("starts a new workspace of a listed person on Pro, and anyone else on Free", async () => {
    const mine = await createWorkspace(u.boss!, "Boss HQ");
    const theirs = await createWorkspace(u.plain!, "Plain Co");
    expect(mine.plan).toBe("PRO");
    expect(theirs.plan).toBe("FREE");
  });

  it("upgrades existing Free workspaces they own when the list is applied, and only those", async () => {
    const owned = await holder.db.workspace.create({ data: { name: "Old", slug: "old-one", memberships: { create: { userId: u.boss!, role: "OWNER" } } } });
    const adminOnly = await holder.db.workspace.create({ data: { name: "Not mine", slug: "not-mine", memberships: { create: [{ userId: u.plain!, role: "OWNER" }, { userId: u.boss!, role: "ADMIN" }] } } });
    const paid = await holder.db.workspace.create({ data: { name: "Paying", slug: "paying", memberships: { create: { userId: u.other!, role: "OWNER" } }, subscription: { create: { stripeCustomerId: "cus_1", status: "canceled" } } } });
    const r = await syncGrantedPlans();
    expect(r.granted).toBeGreaterThanOrEqual(1);
    expect(await plan(owned.id)).toBe("PRO");
    expect(await plan(adminOnly.id)).toBe("FREE"); // an admin is not an owner
    expect(await plan(paid.id)).toBe("FREE"); // Stripe decides workspaces that have a subscription
    expect((await syncGrantedPlans()).granted).toBe(0); // nothing left to do
  });

  it("can be limited to one person", async () => {
    const w = await holder.db.workspace.create({ data: { name: "Other", slug: "other-ws", memberships: { create: { userId: u.other!, role: "OWNER" } } } });
    expect((await syncGrantedPlans(u.boss!)).granted).toBe(0);
    expect(await plan(w.id)).toBe("FREE");
    expect((await syncGrantedPlans(u.other!)).granted).toBe(1);
    expect(await plan(w.id)).toBe("PRO");
  });

  it("follows ownership: a listed person who takes a workspace over brings Pro with them", async () => {
    const w = await createWorkspace(u.plain!, "Handover");
    await holder.db.membership.create({ data: { userId: u.boss!, workspaceId: w.id, role: "MEMBER" } });
    expect(w.plan).toBe("FREE");
    await transferOwnership(u.plain!, w.id, u.boss!);
    expect(await plan(w.id)).toBe("PRO");
  });

  it("is shown as granted on the billing page, not as a subscription", async () => {
    const w = await createWorkspace(u.boss!, "Billing view");
    const b = await getBilling(u.boss!, w.id);
    expect(b).toMatchObject({ plan: "PRO", granted: true, status: "none", hasCustomer: false });
    const free = await createWorkspace(u.plain!, "Free view");
    expect(await getBilling(u.plain!, free.id)).toMatchObject({ plan: "FREE", granted: false });
  });

  it("is applied by the daily maintenance job as well", async () => {
    const w = await holder.db.workspace.create({ data: { name: "Late", slug: "late-ws", memberships: { create: { userId: u.boss!, role: "OWNER" } } } });
    expect(await plan(w.id)).toBe("FREE");
    expect(await maintenance()).toMatchObject({ grantedPlans: 1 });
    expect(await plan(w.id)).toBe("PRO");
  });
});

describe("daily limits on sign-in e-mails", () => {
  const T0 = new Date("2026-11-01T10:00:00Z");

  it("lets one address of the caller ask for a limited number of links a day", async () => {
    for (let i = 0; i < PER_IP_DAILY; i++) expect((await allowSignIn("9.9.9.9", `p${i}@x.io`, T0)).ok, `${i}`).toBe(true);
    expect(await allowSignIn("9.9.9.9", "extra@x.io", T0)).toEqual({ ok: false, reason: "ip" });
    expect((await allowSignIn("9.9.9.8", "fine@x.io", T0)).ok).toBe(true);
  });

  it("protects one mailbox from being flooded from many addresses", async () => {
    for (let i = 0; i < PER_MAILBOX_DAILY; i++) expect((await allowSignIn(`7.7.7.${i}`, "Victim@X.io", T0)).ok, `${i}`).toBe(true);
    expect(await allowSignIn("7.7.7.200", "victim@x.io", T0)).toEqual({ ok: false, reason: "mailbox" });
  });

  it("stops everything at the installation's daily total, to keep the sending account safe", async () => {
    const total = await holder.db.signInAttempt.count({ where: { at: { gt: new Date(T0.getTime() - 24 * HOUR) } } });
    let blocked: unknown = null;
    for (let i = 0; i < 40 && !blocked; i++) {
      const v = await allowSignIn(`6.6.${i}.1`, `g${i}@x.io`, T0);
      if (!v.ok) blocked = v;
    }
    expect(blocked).toEqual({ ok: false, reason: "global" });
    expect(total).toBeGreaterThan(0);
  });

  it("forgets a day later", async () => {
    expect((await allowSignIn("9.9.9.9", "later@x.io", new Date(T0.getTime() + 25 * HOUR))).ok).toBe(true);
  });

  it("stores no readable address or e-mail", async () => {
    const rows = await holder.db.signInAttempt.findMany({ take: 50 });
    for (const r of rows) {
      expect(r.ipHash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.mailHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("is cleaned up after two days", async () => {
    const before = await holder.db.signInAttempt.count();
    await holder.db.signInAttempt.create({ data: { ipHash: "a", mailHash: "b", at: new Date(Date.now() - 3 * 24 * HOUR) } });
    const r = await maintenance();
    expect(r.signInAttempts).toBeGreaterThanOrEqual(1);
    expect(await holder.db.signInAttempt.count({ where: { ipHash: "a" } })).toBe(0);
    expect(before).toBeGreaterThan(0);
  });
});
