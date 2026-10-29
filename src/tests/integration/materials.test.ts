import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
const storage = vi.hoisted(() => ({ deleteObject: vi.fn(async () => undefined), presignUpload: vi.fn(async (key: string) => `https://s3.test/put/${key}`), presignDownload: vi.fn(async (key: string) => `https://s3.test/get/${key}`) }));
vi.mock("@/server/storage", () => storage);
vi.hoisted(() => {
  process.env.APP_URL = "https://meetowl.test";
});

import { createWorkspace } from "@/server/services/workspace";
import { createMaterial, deleteMaterial, listMaterials, materialFileUrl, resolveShare, startMaterialUpload, updateMaterial } from "@/server/services/crm/materials";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let a: string;
let b: string;
let ws: { id: string };
const link = (title: string, extra: Record<string, unknown> = {}) => ({ title, kind: "VIDEO" as const, lang: "ru" as const, url: "https://youtu.be/abc", shared: false, ...extra });

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Лидер" } })).id;
  a = (await t.db.user.create({ data: { email: "a@x.io", name: "A" } })).id;
  b = (await t.db.user.create({ data: { email: "b@x.io", name: "B" } })).id;
  ws = await createWorkspace(owner, "Acme");
  for (const u of [a, b]) await t.db.membership.create({ data: { userId: u, workspaceId: ws.id, role: "MEMBER", crmAccess: true, crmScope: "OWN" } });
});
afterAll(async () => close());

describe("materials", () => {
  it("lets a leader share with the team, and not a member", async () => {
    await expect(createMaterial(a, ws.id, link("Общее", { shared: true }))).rejects.toMatchObject({ status: 403 });
    const m = await createMaterial(owner, ws.id, link("Видео для всех", { shared: true, category: "Знакомство" }));
    expect(m).toMatchObject({ shared: true, canEdit: true, link: "https://youtu.be/abc", category: "Знакомство" });
  });

  it("shows everybody the shared ones and each member only their own", async () => {
    await createMaterial(a, ws.id, link("Моё А"));
    await createMaterial(b, ws.id, link("Моё Б"));
    const forA = (await listMaterials(a, ws.id)).items.map((i) => i.title).sort();
    expect(forA).toEqual(["Видео для всех", "Моё А"]);
    const forOwner = (await listMaterials(owner, ws.id)).items.map((i) => i.title);
    expect(forOwner).toEqual(["Видео для всех"]);
    expect((await listMaterials(a, ws.id)).items.find((i) => i.title === "Видео для всех")?.canEdit).toBe(false);
  });

  it("needs a link or a file, never both, and only a real link", async () => {
    await expect(createMaterial(a, ws.id, { title: "x", kind: "PDF", lang: "en", shared: false })).rejects.toMatchObject({ code: "no_content" });
    await expect(createMaterial(a, ws.id, link("x", { url: "javascript:alert(1)" }))).rejects.toMatchObject({ code: "invalid_link" });
    const ok = await createMaterial(a, ws.id, link("ok"));
    await expect(updateMaterial(a, ok.id, { url: "javascript:alert(1)" })).rejects.toMatchObject({ code: "invalid_link" });
    const file = { key: `${ws.id}/materials/abcd1234-x.pdf`, fileName: "x.pdf", mime: "application/pdf", size: 1000 };
    await expect(createMaterial(a, ws.id, { ...link("x"), file })).rejects.toMatchObject({ code: "two_contents" });
    await expect(createMaterial(a, ws.id, { title: "x", kind: "PDF", lang: "en", shared: false, file: { ...file, key: "other/materials/abcd1234-x.pdf" } })).rejects.toMatchObject({ code: "invalid_key" });
  });

  it("makes a file material, gives a link of ours for it and reads it for the owner only", async () => {
    const up = await startMaterialUpload(a, ws.id, { fileName: "Презентация.pdf", mime: "application/pdf", size: 5000 });
    expect(up.key.startsWith(`${ws.id}/materials/`)).toBe(true);
    const m = await createMaterial(a, ws.id, { title: "PDF", kind: "PDF", lang: "pl", shared: false, file: { key: up.key, fileName: "Презентация.pdf", mime: "application/pdf", size: 5000 } });
    expect(m.hasFile).toBe(true);
    expect(m.link).toMatch(/^https:\/\/meetowl\.test\/m\/[\w-]{16}$/);
    expect((await materialFileUrl(a, m.id)).url).toContain(up.key);
    await expect(materialFileUrl(b, m.id)).rejects.toMatchObject({ status: 404 });
    // the link given out opens the file, and a wrong one opens nothing
    const key = m.link.split("/m/")[1] as string;
    expect((await resolveShare(key))?.url).toContain(up.key);
    expect(await resolveShare("nope")).toBeNull();
  });

  it("sends a link material to its outside address", async () => {
    const m = await createMaterial(a, ws.id, link("Ссылка", { url: "https://example.com/deck" }));
    const key = (await raw.material.findUniqueOrThrow({ where: { id: m.id } })).shareKey;
    expect(await resolveShare(key)).toEqual({ url: "https://example.com/deck" });
  });

  it("keeps the place of the QR code only on pictures", async () => {
    const img = await createMaterial(owner, ws.id, { title: "Сторис", kind: "IMAGE", lang: "ru", shared: true, file: { key: `${ws.id}/materials/img00001-s.png`, fileName: "s.png", mime: "image/png", size: 100 }, qr: { corner: "bottom-right", size: 22 } });
    expect(img.qr).toEqual({ corner: "bottom-right", size: 22 });
    const pdf = await createMaterial(a, ws.id, link("Не картинка", { kind: "PDF", qr: { corner: "center", size: 20 } }));
    expect(pdf.qr).toBeNull();
    const moved = await updateMaterial(owner, img.id, { qr: { corner: "top-left", size: 30 } });
    expect(moved.qr).toEqual({ corner: "top-left", size: 30 });
    expect((await updateMaterial(owner, img.id, { kind: "PDF" })).qr).toBeNull();
  });

  it("is changed or deleted by its owner, or by a leader for a shared one", async () => {
    const mine = await createMaterial(a, ws.id, link("Удалю"));
    await expect(updateMaterial(b, mine.id, { title: "x" })).rejects.toThrow();
    await expect(deleteMaterial(owner, mine.id)).rejects.toMatchObject({ status: 403 });
    await updateMaterial(a, mine.id, { title: "Новое имя", lang: "de" });
    expect((await raw.material.findUniqueOrThrow({ where: { id: mine.id } })).lang).toBe("de");
    await deleteMaterial(a, mine.id);
    expect(await raw.material.count({ where: { id: mine.id } })).toBe(0);
    const shared = (await listMaterials(owner, ws.id)).items[0]!;
    await expect(deleteMaterial(a, shared.id)).rejects.toMatchObject({ status: 403 });
  });

  it("removes the file from the storage with the material", async () => {
    const m = await createMaterial(a, ws.id, { title: "С файлом", kind: "PDF", lang: "ru", shared: false, file: { key: `${ws.id}/materials/del00001-f.pdf`, fileName: "f.pdf", mime: "application/pdf", size: 10 } });
    await deleteMaterial(a, m.id);
    expect(storage.deleteObject).toHaveBeenCalledWith(`${ws.id}/materials/del00001-f.pdf`);
  });
});
