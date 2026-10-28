import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

vi.hoisted(() => {
  Object.assign(process.env, { DATABASE_URL: "postgresql://x", AUTH_SECRET: "x", SUPERADMIN_EMAILS: "boss@example.com" });
});
const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient, mails: [] as { to: string; subject: string }[] }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));
vi.mock("@/server/mail", () => ({
  sendMail: vi.fn(async (m: { to: string; subject: string }) => {
    holder.mails.push(m);
  }),
}));

import { requireFreshAdmin, sendStepUpCode, STEP_UP_MINUTES, stepUpStatus, verifyStepUp } from "@/server/services/admin-stepup";

let close: () => Promise<void>;
let boss: string;
let other: string;
const lastCode = () => /: (\d{6})$/.exec(holder.mails[holder.mails.length - 1]?.subject ?? "")?.[1] ?? "";

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  boss = (await t.db.user.create({ data: { email: "boss@example.com", name: "Boss" } })).id;
  other = (await t.db.user.create({ data: { email: "o@x.io", name: "Other" } })).id;
}, 120_000);
afterAll(async () => close());

describe("proving it is the platform owner again before a dangerous act", () => {
  it("is for the platform owner only", async () => {
    await expect(stepUpStatus(other)).rejects.toMatchObject({ status: 404 });
    await expect(sendStepUpCode(other)).rejects.toMatchObject({ status: 404 });
    await expect(verifyStepUp(other, "123456")).rejects.toMatchObject({ status: 404 });
    await expect(requireFreshAdmin(other)).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a dangerous act until the code from the mailbox has been entered", async () => {
    expect(await stepUpStatus(boss)).toEqual({ fresh: false, until: null });
    await expect(requireFreshAdmin(boss)).rejects.toMatchObject({ status: 403, code: "step_up_required" });
  });

  it("sends the code to the owner's mailbox, takes only the right one, and then opens the acts for ten minutes", async () => {
    const t0 = new Date("2026-11-10T10:00:00Z");
    await sendStepUpCode(boss, t0);
    expect(holder.mails.at(-1)?.to).toBe("boss@example.com");
    const code = lastCode();
    expect(code).toMatch(/^\d{6}$/);
    await expect(verifyStepUp(boss, code === "000000" ? "111111" : "000000", t0)).rejects.toMatchObject({ status: 403 });
    const s = await verifyStepUp(boss, code, t0);
    expect(s.fresh).toBe(true);
    expect(s.until?.getTime()).toBe(t0.getTime() + STEP_UP_MINUTES * 60_000);
    await expect(requireFreshAdmin(boss, new Date(t0.getTime() + 5 * 60_000))).resolves.toBeUndefined();
    // the code works once
    await expect(verifyStepUp(boss, code, t0)).rejects.toMatchObject({ status: 403 });
  });

  it("closes again after ten minutes", async () => {
    const t0 = new Date("2026-11-10T10:00:00Z");
    const later = new Date(t0.getTime() + (STEP_UP_MINUTES + 1) * 60_000);
    expect((await stepUpStatus(boss, later)).fresh).toBe(false);
    await expect(requireFreshAdmin(boss, later)).rejects.toMatchObject({ code: "step_up_required" });
  });
});
