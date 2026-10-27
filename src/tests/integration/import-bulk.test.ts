import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient, ops: 0 }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { commitImport } from "@/server/services/crm/imports";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let ws: { id: string };

const bytes = (s: string) => new TextEncoder().encode(s);
/** What a remote database makes slow is the number of round trips, so that is what these tests pin down. */
const counted = async <T>(fn: () => Promise<T>): Promise<{ result: T; calls: number }> => {
  holder.ops = 0;
  const result = await fn();
  return { result, calls: holder.ops };
};

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db.$extends({ query: { $allOperations: async ({ args, query }) => { holder.ops++; return query(args); } } }) as unknown as PrismaClient;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "O" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
}, 120_000);
afterAll(async () => close?.());

describe("big imports", () => {
  const people = Array.from({ length: 325 }, (_, i) => `Тест Контакт${i}`);
  const file = ["ФИО,Страна,Компания,Сайт,Комментарий", ...people.map((n, i) => `${n},Португалия,Firma ${i % 120} LLC,${i % 120 < 30 ? `firma${i % 120}.io` : ""},заметка ${i}`)].join("\n");

  it("imports hundreds of people and their companies in a handful of database calls, not several per person", async () => {
    const { result, calls } = await counted(() => commitImport(owner, ws.id, bytes(file), { entity: "contacts", policy: "skip", noteColumns: ["Страна"] }));
    expect(result).toMatchObject({ created: 325, errorCount: 0 });
    expect(calls).toBeLessThan(60); // it was about four per person (1300) before
  }, 60_000);

  it("writes everything a one-by-one import wrote", async () => {
    expect(await raw.contact.count({ where: { workspaceId: ws.id } })).toBe(325);
    expect(await raw.company.count({ where: { workspaceId: ws.id } })).toBe(120); // "Firma 7 LLC" and its repeats are one company
    expect(await raw.crmActivity.count({ where: { workspaceId: ws.id, type: "NOTE" } })).toBe(325);
    expect(await raw.activityLog.count({ where: { workspaceId: ws.id, action: "contact.created" } })).toBe(325);
    expect(await raw.activityLog.count({ where: { workspaceId: ws.id, action: "company.created" } })).toBe(120);

    const anna = await raw.contact.findFirstOrThrow({ where: { workspaceId: ws.id, firstName: "Тест", lastName: "Контакт7" }, include: { node: true } });
    expect(anna.node).toMatchObject({ type: "CONTACT", title: "Тест Контакт7", createdById: owner, archivedAt: null });
    expect(anna.ownerId).toBe(owner);
    const company = await raw.company.findUniqueOrThrow({ where: { nodeId: anna.companyId as string } });
    expect(company.legalName).toBe("Firma 7 LLC");
    expect(anna.node.parentId).toBe(company.nodeId);
    expect(anna.node.rootId).toBe(company.nodeId);
    const note = await raw.crmActivity.findFirstOrThrow({ where: { contactId: anna.nodeId } });
    expect(note.body).toBe("заметка 7\nСтрана: Португалия"); // the comment column, then the chosen extra column
  });

  it("keeps the order of the file in the list", async () => {
    const rows = await raw.node.findMany({ where: { workspaceId: ws.id, type: "CONTACT" }, orderBy: { position: "asc" }, select: { title: true } });
    expect(rows.slice(0, 3).map((r) => r.title)).toEqual(["Тест Контакт0", "Тест Контакт1", "Тест Контакт2"]);
  });

  it("a second import of the same names adds nobody, again in few calls", async () => {
    const { result, calls } = await counted(() => commitImport(owner, ws.id, bytes(file), { entity: "contacts", policy: "skip", noteColumns: ["Страна"] }));
    // Names only, no e-mail or phone: matched by full name. (Rows that have a company still match by name.)
    expect(result.created).toBe(0);
    expect(result.skipped).toBe(325);
    expect(calls).toBeLessThan(30);
  }, 60_000);

  it("imports a few hundred companies at once as well", async () => {
    const csv = ["Название,Сайт,Город", ...Array.from({ length: 250 }, (_, i) => `Компания ${i},site${i}.io,Лиссабон`)].join("\n");
    const { result, calls } = await counted(() => commitImport(owner, ws.id, bytes(csv), { entity: "companies", policy: "skip", mapping: { legalName: "Название", website: "Сайт", city: "Город" } }));
    expect(result).toMatchObject({ created: 250, errorCount: 0 });
    expect(calls).toBeLessThan(40);
    expect(await raw.company.count({ where: { workspaceId: ws.id, city: "Лиссабон" } })).toBe(250);
  }, 60_000);
});
