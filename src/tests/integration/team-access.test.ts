import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

vi.hoisted(() => {
  Object.assign(process.env, { DATABASE_URL: "postgresql://x", AUTH_SECRET: "x", PAID_PLANS: "true", SUPERADMIN_EMAILS: "boss@example.com", PRO_OWNER_EMAILS: "" });
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
import { entitlementOf, startTrial, syncPlan } from "@/server/services/entitlements";
import { setTeamAccess } from "@/server/services/admin";

let close: () => Promise<void>;
let raw: PrismaClient;
const ids: Record<string, string> = {};
const wss: Record<string, string> = {};
const plan = async (who: string) => (await raw.workspace.findUniqueOrThrow({ where: { id: wss[who] as string }, select: { plan: true } })).plan;

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  // boss (platform owner) → anna → bob; carl found the site alone
  ids.boss = (await raw.user.create({ data: { email: "boss@example.com", name: "Boss" } })).id;
  ids.anna = (await raw.user.create({ data: { email: "anna@x.io", name: "Anna", referredById: ids.boss } })).id;
  ids.bob = (await raw.user.create({ data: { email: "bob@x.io", name: "Bob", referredById: ids.anna } })).id;
  ids.carl = (await raw.user.create({ data: { email: "carl@x.io", name: "Carl" } })).id;
  for (const who of ["anna", "bob", "carl"]) {
    wss[who] = (await createWorkspace(ids[who] as string, who)).id;
    await syncPlan(wss[who] as string);
  }
}, 120_000);
afterAll(async () => close?.());

describe("free team access under paid rules", () => {
  it("the owner's people at any depth have Pro for free and no trial; a stranger is Free and gets the 14-day trial", async () => {
    expect(await plan("anna")).toBe("PRO");
    expect(await plan("bob")).toBe("PRO");
    expect(await startTrial(ids.bob as string, wss.bob as string)).toBe(false);
    expect((await entitlementOf(wss.bob as string)).teamFree).toBe(true);
    expect(await plan("carl")).toBe("FREE");
    expect(await startTrial(ids.carl as string, wss.carl as string)).toBe(true);
    expect((await entitlementOf(wss.carl as string)).teamFree).toBe(false);
  });

  it("switching a person off ends free access for their branch, with 14 days of Pro to decide", async () => {
    const r = await setTeamAccess(ids.boss as string, ids.anna as string, { value: "OFF" });
    expect(r).toMatchObject({ branch: 2, lost: 2 });
    expect((await entitlementOf(wss.bob as string)).teamFree).toBe(false);
    const w = await raw.workspace.findUniqueOrThrow({ where: { id: wss.bob as string } });
    expect(w.giftUntil && w.giftUntil.getTime() - Date.now()).toBeGreaterThan(13 * 86_400_000);
    expect(await plan("bob")).toBe("PRO"); // the grace days
  });

  it("someone below can be switched on by hand; back to the chain restores the branch", async () => {
    await setTeamAccess(ids.boss as string, ids.bob as string, { value: "ON" });
    expect((await entitlementOf(wss.bob as string)).teamFree).toBe(true);
    await setTeamAccess(ids.boss as string, ids.anna as string, { value: "AUTO" });
    expect((await entitlementOf(wss.anna as string)).teamFree).toBe(true);
  });

  it("the platform owner's own access cannot be switched, and nobody else may switch it", async () => {
    await expect(setTeamAccess(ids.boss as string, ids.boss as string, { value: "OFF" })).rejects.toBeTruthy();
    await expect(setTeamAccess(ids.anna as string, ids.carl as string, { value: "ON" })).rejects.toBeTruthy();
  });
});
