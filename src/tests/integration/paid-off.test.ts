import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

vi.hoisted(() => {
  Object.assign(process.env, { DATABASE_URL: "postgresql://x", AUTH_SECRET: "x", PAID_PLANS: "false", PAID_PLANS_PREVIEW_EMAILS: "", STRIPE_SECRET_KEY: "sk_test_x", STRIPE_PRICE_PRO: "price_x", SUPERADMIN_EMAILS: "boss@example.com" });
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
import { entitlementOf, expireTimed, recomputePlans, startTrial, syncPlan } from "@/server/services/entitlements";
import { getBilling, startCheckout } from "@/server/services/billing";
import { isEnforcedFor, paidMode } from "@/server/services/paid-plans";
import { listUsers, recomputeAllPlans } from "@/server/services/admin";

let close: () => Promise<void>;
let raw: PrismaClient;
let anna: string;
let boss: string;
let ws: { id: string };
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

describe("paid plans switched off", () => {
  it("the mode is off and no workspace is under the paid rules", async () => {
    expect(paidMode()).toBe("off");
    expect(await isEnforcedFor(ws.id)).toBe(false);
  });
  it("every workspace has everything: Pro in force, whatever it has paid", async () => {
    expect(await plan()).toBe("FREE"); // as made, until the plan is put right
    await syncPlan(ws.id);
    expect(await plan()).toBe("PRO");
    expect((await raw.workspace.findUniqueOrThrow({ where: { id: ws.id } })).basePlan).toBe("FREE");
  });
  it("no trial starts, and nothing is shown about one", async () => {
    expect(await startTrial(anna, ws.id)).toBe(false);
    expect((await raw.workspace.findUniqueOrThrow({ where: { id: ws.id } })).trialEndsAt).toBeNull();
    expect(await entitlementOf(ws.id)).toMatchObject({ enforced: false, trialDaysLeft: null, trialEnded: false });
  });
  it("the billing page says it is open, and nothing can be bought", async () => {
    expect(await getBilling(anna, ws.id)).toMatchObject({ enforced: false, plan: "PRO" });
    await expect(startCheckout(anna, ws.id)).rejects.toMatchObject({ status: 409, code: "paid_plans_off" });
  });
  it("recomputing brings every workspace to open, and does it once", async () => {
    const other = await createWorkspace(anna, "Other");
    const third = await createWorkspace(boss, "Third");
    expect(await plan(other.id)).toBe("FREE");
    const r = await recomputePlans();
    expect(r).toMatchObject({ mode: "off", changed: 2 });
    expect(await plan(other.id)).toBe("PRO");
    expect(await plan(third.id)).toBe("PRO");
    expect(await recomputePlans()).toMatchObject({ changed: 0 });
  });
  it("only the platform owner can recompute from the admin, and it is logged; the admin shows the mode", async () => {
    await expect(recomputeAllPlans(anna)).rejects.toMatchObject({ status: 404 });
    expect(await recomputeAllPlans(boss)).toMatchObject({ mode: "off" });
    expect(await raw.adminLog.count({ where: { action: "plans.recomputed" } })).toBe(1);
    expect((await listUsers(boss, { page: 1, pageSize: 10 })).mode).toBe("off");
  });
  it("the daily run of ended sources does not take Pro away while everything is open", async () => {
    await raw.workspace.update({ where: { id: ws.id }, data: { trialEndsAt: new Date("2020-01-01") } });
    await expireTimed();
    expect(await plan()).toBe("PRO");
  });
});
