import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

vi.hoisted(() => {
  Object.assign(process.env, { DATABASE_URL: "postgresql://x", AUTH_SECRET: "x", PAID_PLANS: "false", PAID_PLANS_PREVIEW_EMAILS: " Tester@X.io , other@x.io " });
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
import { entitlementOf, expireTimed, recomputePlans, startTrial } from "@/server/services/entitlements";
import { isEnforcedFor, paidMode, previewEmails } from "@/server/services/paid-plans";

let close: () => Promise<void>;
let raw: PrismaClient;
const at = (s: string) => new Date(`${s}T10:00:00Z`);
const plan = async (id: string) => (await raw.workspace.findUniqueOrThrow({ where: { id }, select: { plan: true } })).plan;

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
}, 120_000);
afterAll(async () => close?.());

describe("paid plans in preview", () => {
  it("is on for the listed people only, in any case", async () => {
    expect(paidMode()).toBe("preview");
    expect(previewEmails()).toEqual(["tester@x.io", "other@x.io"]);
    const tester = (await raw.user.create({ data: { email: "TESTER@x.io" } })).id;
    const friend = (await raw.user.create({ data: { email: "friend@x.io" } })).id;
    const t = await createWorkspace(tester, "Tester's");
    const f = await createWorkspace(friend, "Friend's");
    expect(await isEnforcedFor(t.id)).toBe(true);
    expect(await isEnforcedFor(f.id)).toBe(false);
  });

  it("a listed person's workspace lives under the paid rules: Free, then a trial, then Free again; everyone else has everything", async () => {
    const tester = (await raw.user.findUniqueOrThrow({ where: { email: "TESTER@x.io" } })).id;
    const friend = (await raw.user.findUniqueOrThrow({ where: { email: "friend@x.io" } })).id;
    const t = (await raw.workspace.findFirstOrThrow({ where: { memberships: { some: { userId: tester } } } })).id;
    const f = (await raw.workspace.findFirstOrThrow({ where: { memberships: { some: { userId: friend } } } })).id;
    await recomputePlans(at("2026-11-02"));
    expect(await plan(t)).toBe("FREE");
    expect(await plan(f)).toBe("PRO");
    expect(await startTrial(tester, t, at("2026-11-02"))).toBe(true);
    expect(await startTrial(friend, f, at("2026-11-02"))).toBe(false);
    expect(await plan(t)).toBe("PRO");
    expect(await entitlementOf(t, at("2026-11-02"))).toMatchObject({ enforced: true, trialDaysLeft: 14 });
    expect(await entitlementOf(f, at("2026-11-02"))).toMatchObject({ enforced: false, trialDaysLeft: null });
    await expireTimed(at("2026-11-20"));
    expect(await plan(t)).toBe("FREE");
    expect(await plan(f)).toBe("PRO");
  });
});
