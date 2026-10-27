import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { getContact } from "@/server/services/crm/contacts";
import { ensureMyPartnerCard } from "@/server/services/crm/people";
import { listMembers } from "@/server/services/membership";
import { patchProfileSchema, updateProfile } from "@/server/services/profile";

let close: () => Promise<void>;
let raw: PrismaClient;
let me: string;
let ws: { id: string };
const patch = (v: Record<string, unknown>) => updateProfile(me, patchProfileSchema.parse(v));

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  me = (await t.db.user.create({ data: { email: "andrei@x.io", name: "Old Name" } })).id;
  ws = await createWorkspace(me, "Acme");
}, 120_000);
afterAll(async () => close?.());

describe("my profile", () => {
  it("first and last name make the display name the whole app shows", async () => {
    const u = await patch({ firstName: " Andrei ", lastName: "Yasinski" });
    expect(u).toMatchObject({ firstName: "Andrei", lastName: "Yasinski", name: "Andrei Yasinski" });
    expect((await listMembers(ws.id))[0]?.user.name).toBe("Andrei Yasinski");
  });
  it("changing one name keeps the other", async () => {
    expect(await patch({ lastName: "Nowak" })).toMatchObject({ firstName: "Andrei", lastName: "Nowak", name: "Andrei Nowak" });
  });
  it("clearing both names keeps the last display name rather than leaving none", async () => {
    const u = await patch({ firstName: "", lastName: "" });
    expect(u).toMatchObject({ firstName: null, lastName: null, name: "Andrei Nowak" });
    await patch({ firstName: "Andrei", lastName: "Yasinski" });
  });
  it("a phone and a Telegram name are checked and tidied; empty clears them", async () => {
    expect(await patch({ phone: "+48  600 100 200", telegram: "https://t.me/andrei_y" })).toMatchObject({ phone: "+48 600 100 200", telegram: "andrei_y" });
    await expect(patch({ phone: "abc" })).rejects.toMatchObject({ code: "invalid_phone", status: 422 });
    await expect(patch({ telegram: "no spaces here" })).rejects.toMatchObject({ code: "invalid_telegram", status: 422 });
    expect(await patch({ phone: "", telegram: "" })).toMatchObject({ phone: null, telegram: null });
  });
  it("other settings are saved on their own without touching the names", async () => {
    expect(await patch({ locale: "ru" })).toMatchObject({ locale: "ru", name: "Andrei Yasinski" });
  });
  it("the member's own partner card takes the name, e-mail, phone and Telegram from the profile", async () => {
    await patch({ phone: "+48 600 100 200", telegram: "@andrei_y" });
    const { id } = await ensureMyPartnerCard(me, ws.id);
    const c = await getContact(me, id);
    expect(c).toMatchObject({ firstName: "Andrei", lastName: "Yasinski", phones: ["+48 600 100 200"], emails: ["andrei@x.io"], messengers: { telegram: "andrei_y" } });
    expect(await raw.user.count()).toBe(1);
  });
});
