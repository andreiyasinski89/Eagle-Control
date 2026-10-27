import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
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
import { listContacts } from "@/server/services/crm/contacts";
import { commitImport, previewImport } from "@/server/services/crm/imports";
import { readCsvUpload } from "@/server/http/upload";

let close: () => Promise<void>;
let owner: string;
let ws: { id: string };

const upload = (file: File, fields: Record<string, string> = {}) => {
  const fd = new FormData();
  fd.set("file", file);
  fd.set("entity", "contacts");
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return readCsvUpload(new NextRequest("http://localhost/api/imports", { method: "POST", body: fd }));
};
const xlsx = () => new File([readFileSync(join(process.cwd(), "src/tests/fixtures/contacts.xlsx"))], "contacts.xlsx");

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "owner@x.io", name: "Owner" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
}, 120_000);

afterAll(async () => close?.());

describe("Excel import", () => {
  it("reads the sheet below the title rows and suggests the name and note columns", async () => {
    const { bytes, options } = await upload(xlsx());
    const p = await previewImport(owner, ws.id, bytes, options);
    expect(p.headers).toEqual(["П или Б", "ФИО", "Страна", "Комментарий"]);
    expect(p.mapping).toMatchObject({ fullName: "ФИО", notes: "Комментарий" });
    expect(p.totalRows).toBe(2);
    expect(p.summary).toMatchObject({ created: 2, errorCount: 0 });
  });

  it("imports people without e-mail or phone, keeps chosen columns in the note, and does not double on a second import", async () => {
    const { bytes, options } = await upload(xlsx(), { noteColumns: JSON.stringify(["Страна"]) });
    expect(options.noteColumns).toEqual(["Страна"]);
    expect(await commitImport(owner, ws.id, bytes, options)).toMatchObject({ created: 2, skipped: 0 });

    const list = await listContacts(owner, ws.id, { sort: "name", dir: "asc", page: 1, pageSize: 100 });
    expect(list.items.map((c) => c.name)).toEqual(["Анна Пример", "Борис Образец"]);
    const note = await holder.db.crmActivity.findFirst({ where: { workspaceId: ws.id, type: "NOTE", body: { contains: "Португалия" } } });
    expect(note?.body).toBe("Теплый\nСтрана: Португалия");

    const again = await upload(xlsx(), { noteColumns: JSON.stringify(["Страна"]) });
    expect(await commitImport(owner, ws.id, again.bytes, again.options)).toMatchObject({ created: 0, skipped: 2 });
    expect(await holder.db.contact.count()).toBe(2);
  });

  it("explains a broken workbook instead of failing with a stack trace", async () => {
    const broken = new File([new Uint8Array([0x50, 0x4b, 3, 4, 9, 9, 9, 9])], "x.xlsx");
    await expect(upload(broken)).rejects.toMatchObject({ status: 400, code: "bad_xlsx" });
  });
});
