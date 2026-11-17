import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

// Paid plans on: the rules of Free and Pro are in force, so the locks and the points exchange can be seen working.
vi.hoisted(() => {
  Object.assign(process.env, { DATABASE_URL: "postgresql://x", AUTH_SECRET: "x", PAID_PLANS: "true", PAID_PLANS_PREVIEW_EMAILS: "", SUPERADMIN_EMAILS: "boss@example.com" });
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
import { syncPlan } from "@/server/services/entitlements";
import { getBilling, redeemPoints } from "@/server/services/billing";
import { getNetwork } from "@/server/services/crm/network";
import { exportContactsCsv } from "@/server/services/crm/imports";
import { createTeam } from "@/server/services/teams";

let close: () => Promise<void>;
let raw: PrismaClient;
let anna: string;
let ws: { id: string };
const NOW = new Date("2099-03-01T10:00:00.000Z");
const plan = async () => (await raw.workspace.findUniqueOrThrow({ where: { id: ws.id }, select: { plan: true, bonusUntil: true } }));

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  anna = (await t.db.user.create({ data: { email: "anna@x.io", name: "Anna" } })).id;
  ws = await createWorkspace(anna, "Anna's");
  await syncPlan(ws.id, NOW);
}, 120_000);
afterAll(async () => close?.());

describe("Pro parts on the Free plan", () => {
  it("are refused with plan_feature, which the screens show as Available in Pro", async () => {
    expect((await plan()).plan).toBe("FREE");
    await expect(getNetwork(anna, ws.id)).rejects.toMatchObject({ status: 402, code: "plan_feature", details: { feature: "network" } });
    await expect(exportContactsCsv(anna, ws.id, { page: 1, pageSize: 50 } as never)).rejects.toMatchObject({ status: 402, details: { feature: "contactsExport" } });
    await expect(createTeam(anna, ws.id, { name: "Leaders", memberIds: [] } as never)).rejects.toMatchObject({ status: 402, details: { feature: "teams" } });
  });
});

describe("bonus points for months of Pro", () => {
  const give = (points: number, ref: string) => raw.bonusPoint.create({ data: { userId: anna, points, reason: "invite", refUserId: ref } });

  it("refuses without enough points and spends nothing", async () => {
    await give(2, "p1");
    await expect(redeemPoints(anna, ws.id, { months: 1 }, NOW)).rejects.toMatchObject({ status: 409, code: "not_enough_points" });
    expect((await getBilling(anna, ws.id, NOW)).points).toBe(2);
  });

  it("3 points make a month of Pro, written down as a spending; a second exchange adds on after the first", async () => {
    await give(5, "p2"); // 7 in all
    const first = await redeemPoints(anna, ws.id, { months: 1 }, NOW);
    expect(first.points).toBe(4);
    expect(first.bonusUntil.toISOString()).toBe("2099-03-31T10:00:00.000Z");
    expect((await plan()).plan).toBe("PRO");
    expect(await raw.bonusPoint.findFirst({ where: { userId: anna, reason: "redeem" } })).toMatchObject({ points: -3 });
    const second = await redeemPoints(anna, ws.id, { months: 1 }, NOW);
    expect(second.bonusUntil.toISOString()).toBe("2099-04-30T10:00:00.000Z");
    expect(second.points).toBe(1);
    expect((await getBilling(anna, ws.id, NOW)).entitlement.sources).toEqual([expect.objectContaining({ source: "bonus" })]);
  });

  it("two presses at once cannot spend the same points twice", async () => {
    await give(2, "p3"); // 3 in all: enough for one month only
    const r = await Promise.allSettled([redeemPoints(anna, ws.id, { months: 1 }, NOW), redeemPoints(anna, ws.id, { months: 1 }, NOW)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await getBilling(anna, ws.id, NOW)).points).toBe(0);
  });

  it("only the owner exchanges", async () => {
    const bob = (await raw.user.create({ data: { email: "bob@x.io" } })).id;
    await raw.membership.create({ data: { userId: bob, workspaceId: ws.id, role: "MEMBER" } });
    await raw.bonusPoint.create({ data: { userId: bob, points: 3, reason: "invite", refUserId: "p9" } });
    await expect(redeemPoints(bob, ws.id, { months: 1 }, NOW)).rejects.toMatchObject({ status: 403 });
  });
});
