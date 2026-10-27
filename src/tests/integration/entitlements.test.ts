import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

vi.hoisted(() => {
  Object.assign(process.env, { DATABASE_URL: "postgresql://x", AUTH_SECRET: "x", PRO_OWNER_EMAILS: "boss@example.com", SUPERADMIN_EMAILS: "boss@example.com" });
});
const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { entitlementOf, expireTimed, startTrial, syncPlan } from "@/server/services/entitlements";
import { getBilling, handleStripeEvent, startCheckout } from "@/server/services/billing";
import { setWorkspacePlan } from "@/server/services/admin";
import { syncGrantedPlans } from "@/server/services/grants";
import { checkLimit } from "@/modules/plans";

let close: () => Promise<void>;
let raw: PrismaClient;
let anna: string;
let boss: string;
let ws: { id: string };
const at = (s: string) => new Date(`${s}T10:00:00Z`);
const plan = async (id = ws.id) => (await raw.workspace.findUniqueOrThrow({ where: { id }, select: { plan: true } })).plan;

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  anna = (await t.db.user.create({ data: { email: "anna@x.io", name: "Anna" } })).id;
  boss = (await t.db.user.create({ data: { email: "boss@example.com", name: "Boss" } })).id;
  ws = await createWorkspace(anna, "Anna's");
}, 120_000);
afterAll(async () => close?.());

describe("the Pro trial", () => {
  it("a new workspace is Free until its owner starts the trial, which gives 14 days of Pro", async () => {
    expect(await plan()).toBe("FREE");
    expect(await startTrial(anna, ws.id, at("2026-11-02"))).toBe(true);
    expect(await plan()).toBe("PRO");
    const e = await entitlementOf(ws.id, at("2026-11-02"));
    expect(e).toMatchObject({ plan: "PRO", basePlan: "FREE", trialDaysLeft: 14, trialEnded: false });
    expect(e.sources.map((s) => s.source)).toEqual(["trial"]);
    expect(await raw.notification.count({ where: { userId: anna, kind: "billing" } })).toBe(1);
  });
  it("starts once per workspace and once per person, never for a stranger's workspace", async () => {
    expect(await startTrial(anna, ws.id, at("2026-11-03"))).toBe(false);
    const second = await createWorkspace(anna, "Second");
    expect(await startTrial(anna, second.id, at("2026-11-03"))).toBe(false);
    const bob = await raw.user.create({ data: { email: "bob@x.io" } });
    expect(await startTrial(bob.id, second.id, at("2026-11-03"))).toBe(false);
    expect(await plan(second.id)).toBe("FREE");
  });
  it("is not given to someone who already has Pro from the list of addresses", async () => {
    const w = await createWorkspace(boss, "Boss's");
    expect(await plan(w.id)).toBe("PRO");
    expect(await startTrial(boss, w.id)).toBe(false);
    expect((await raw.workspace.findUniqueOrThrow({ where: { id: w.id } })).trialEndsAt).toBeNull();
  });
  it("reminds the owners in the last three days, once, and ends back on Free with nothing deleted", async () => {
    await raw.workspace.update({ where: { id: ws.id }, data: { trialEndsAt: at("2026-11-04") } });
    expect(await expireTimed(at("2026-11-02"))).toEqual({ ended: 0, reminded: 1 });
    await expireTimed(at("2026-11-03"));
    expect(await raw.notification.count({ where: { userId: anna, dedupeKey: `trial:remind:${ws.id}` } })).toBe(1);
    expect(await plan()).toBe("PRO");
    expect(await expireTimed(at("2026-11-05"))).toMatchObject({ ended: 1 });
    expect(await plan()).toBe("FREE");
    const e = await entitlementOf(ws.id, at("2026-11-05"));
    expect(e).toMatchObject({ plan: "FREE", trialEnded: true, trialDaysLeft: null });
    expect(await raw.workspace.count({ where: { id: ws.id } })).toBe(1);
  });
});

describe("a trial, a subscription and the rest together", () => {
  it("a subscription can be started during a trial; the plan stays Pro when the trial ends", async () => {
    const w = await createWorkspace(anna, "Third");
    await raw.workspace.update({ where: { id: w.id }, data: { trialEndsAt: at("2026-12-10") } });
    await syncPlan(w.id, at("2026-12-01"));
    expect(await plan(w.id)).toBe("PRO");
    // checkout is not refused because of the trial (it stops at the missing Stripe keys, not at "already subscribed")
    await expect(startCheckout(anna, w.id)).rejects.not.toMatchObject({ code: "already_subscribed" });
    await raw.subscription.create({ data: { workspaceId: w.id, status: "active", stripeCustomerId: "cus_t", lastEventAt: at("2026-12-01") } });
    await handleStripeEvent({ id: "evt_t1", type: "customer.subscription.updated", created: Math.floor(at("2026-12-02").getTime() / 1000), data: { object: { id: "sub_t", status: "active", customer: "cus_t", metadata: { workspaceId: w.id } } } }, at("2026-12-02"));
    expect((await raw.workspace.findUniqueOrThrow({ where: { id: w.id } })).basePlan).toBe("PRO");
    await expireTimed(at("2026-12-20"));
    expect(await plan(w.id)).toBe("PRO");
    expect(await getBilling(anna, w.id, at("2026-12-20"))).toMatchObject({ plan: "PRO", granted: false, status: "active" });
  });
  it("when a subscription ends during a trial, Pro goes on until the trial ends", async () => {
    const w = await createWorkspace(anna, "Fourth");
    await raw.workspace.update({ where: { id: w.id }, data: { basePlan: "PRO", trialEndsAt: at("2026-12-30") } });
    await raw.subscription.create({ data: { workspaceId: w.id, status: "active", stripeCustomerId: "cus_u", lastEventAt: at("2026-12-01") } });
    await handleStripeEvent({ id: "evt_u1", type: "customer.subscription.deleted", created: Math.floor(at("2026-12-05").getTime() / 1000), data: { object: { id: "sub_u", status: "canceled", customer: "cus_u", metadata: { workspaceId: w.id } } } }, at("2026-12-05"));
    expect(await raw.workspace.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ basePlan: "FREE", plan: "PRO" });
    await expireTimed(at("2026-12-31"));
    expect(await plan(w.id)).toBe("FREE");
  });
  it("a bonus or a gift keeps Pro for as long as it lasts, and the administrator's setting is lasting", async () => {
    const w = await createWorkspace(anna, "Fifth");
    await raw.workspace.update({ where: { id: w.id }, data: { giftUntil: at("2027-01-10") } });
    await syncPlan(w.id, at("2027-01-01"));
    expect(await plan(w.id)).toBe("PRO");
    await expireTimed(at("2027-01-11"));
    expect(await plan(w.id)).toBe("FREE");
    await setWorkspacePlan(boss, w.id, "PRO");
    expect(await raw.workspace.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ basePlan: "PRO", plan: "PRO" });
    await expireTimed(at("2027-02-01"));
    expect(await plan(w.id)).toBe("PRO");
    // taking the lasting plan away leaves Pro while a gift is still running (the better of the two counts), and drops it when none is
    await setWorkspacePlan(boss, w.id, "FREE");
    expect(await plan(w.id)).toBe("PRO");
    await raw.workspace.update({ where: { id: w.id }, data: { giftUntil: null } });
    await syncPlan(w.id);
    expect(await plan(w.id)).toBe("FREE");
  });
  it("the list of addresses is lasting Pro: it survives the end of a trial", async () => {
    const w = await createWorkspace(anna, "Sixth");
    await raw.workspace.update({ where: { id: w.id }, data: { trialEndsAt: at("2027-03-01") } });
    await raw.membership.create({ data: { userId: boss, workspaceId: w.id, role: "OWNER" } });
    expect((await syncGrantedPlans(boss)).granted).toBeGreaterThanOrEqual(1);
    expect(await raw.workspace.findUniqueOrThrow({ where: { id: w.id } })).toMatchObject({ basePlan: "PRO", plan: "PRO" });
    await expireTimed(at("2027-03-05"));
    expect(await plan(w.id)).toBe("PRO");
  });
});

describe("the Free limits", () => {
  it("are 300 people, 3 members, 3 projects and one pipeline", () => {
    expect(checkLimit("FREE", "contacts", 299).allowed).toBe(true);
    expect(checkLimit("FREE", "contacts", 300).allowed).toBe(false);
    expect(checkLimit("FREE", "users", 3).allowed).toBe(false);
    expect(checkLimit("FREE", "projects", 3).allowed).toBe(false);
    expect(checkLimit("FREE", "pipelines", 1).allowed).toBe(false);
    expect(checkLimit("PRO", "contacts", 100_000).allowed).toBe(true);
  });
});
