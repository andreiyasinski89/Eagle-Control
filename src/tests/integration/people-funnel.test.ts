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
import { createContact, gdprExport, getContact, listContacts, updateContact } from "@/server/services/crm/contacts";
import { addPeople, listPeople } from "@/server/services/crm/people";
import { commitImport, previewImport } from "@/server/services/crm/imports";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let partner: string;
let ws: { id: string };

const bytes = (s: string) => new TextEncoder().encode(s);
const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db.$extends({ query: { $allOperations: async ({ args, query }) => { holder.ops++; return query(args); } } }) as unknown as PrismaClient;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  partner = (await t.db.user.create({ data: { email: "p@x.io", name: "Partner" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO", contactPrivacy: "OPEN" } });
  await t.db.membership.create({ data: { userId: partner, workspaceId: ws.id, role: "MEMBER" } });
}, 120_000);
afterAll(async () => close?.());

describe("a person in the funnel", () => {
  it("starts as a new lead, and keeps what is said about them", async () => {
    const c = await createContact(owner, ws.id, { ...base, firstName: "Anna", lastName: "Kowalska", stage: "WARMING", temperature: "WARM", source: "Instagram", interests: ["Путешествия"], influence: 6, nextStep: "Call", nextStepAt: "2026-11-05T00:00:00.000Z", typeTag: "BUSINESS", country: "Poland", sponsorName: "Andrey" });
    expect(c).toMatchObject({ stage: "WARMING", temperature: "WARM", source: "Instagram", interests: ["Путешествия"], influence: 6, nextStep: "Call", typeTag: "BUSINESS", country: "Poland", sponsorName: "Andrey" });
    const plain = await createContact(owner, ws.id, { ...base, firstName: "Boris" });
    expect(plain).toMatchObject({ stage: "NEW", temperature: null, interests: [], influence: null });
    const history = await raw.contactStageEvent.findMany({ where: { contactNodeId: c.id } });
    expect(history).toEqual([expect.objectContaining({ fromStage: null, toStage: "WARMING" })]);
  });

  it("moving a person along the funnel leaves an event; saving the same stage does not", async () => {
    const id = (await listContacts(owner, ws.id, { sort: "name", dir: "asc", page: 1, pageSize: 10, q: "Anna" })).items[0]!.id;
    const before = (await getContact(owner, id)).stageChangedAt;
    await new Promise((r) => setTimeout(r, 15));
    await updateContact(owner, id, { stage: "PRESENTATION" });
    await updateContact(owner, id, { stage: "PRESENTATION", temperature: "HOT" });
    const after = await getContact(owner, id);
    expect(after).toMatchObject({ stage: "PRESENTATION", temperature: "HOT" });
    expect(after.stageChangedAt.getTime()).toBeGreaterThan(before.getTime());
    const events = await raw.contactStageEvent.findMany({ where: { contactNodeId: id }, orderBy: { at: "asc" } });
    expect(events.map((e) => [e.fromStage, e.toStage])).toEqual([[null, "WARMING"], ["WARMING", "PRESENTATION"]]);
    await updateContact(owner, id, { nextStep: null, nextStepAt: null, interests: [] });
    expect(await getContact(owner, id)).toMatchObject({ nextStep: null, nextStepAt: null, interests: [] });
  });

  it("is part of what is exported about the person, with the history of stages", async () => {
    const id = (await listContacts(owner, ws.id, { sort: "name", dir: "asc", page: 1, pageSize: 10, q: "Anna" })).items[0]!.id;
    const out = await gdprExport(owner, id);
    expect(out.contact).toMatchObject({ stage: "PRESENTATION", country: "Poland" });
    expect(out.stageHistory.map((e) => e.toStage)).toEqual(["WARMING", "PRESENTATION"]);
  });

  it("the contact list can be narrowed by stage and warmth", async () => {
    const hot = await listContacts(owner, ws.id, { sort: "name", dir: "asc", page: 1, pageSize: 10, temperature: "HOT" });
    expect(hot.items.map((c) => c.name)).toEqual(["Anna Kowalska"]);
    const fresh = await listContacts(owner, ws.id, { sort: "name", dir: "asc", page: 1, pageSize: 10, stage: "NEW" });
    expect(fresh.items.map((c) => c.name)).toEqual(["Boris"]);
  });
});

describe("the board of people", () => {
  it("lists everyone with their stage, counts the columns, and knows how many people there are in all", async () => {
    const r = await listPeople(owner, ws.id, { due: "0" }, new Date("2026-11-04T12:00:00.000Z"));
    expect(r.counts).toMatchObject({ NEW: 1, PRESENTATION: 1, WARMING: 0, CLIENT: 0 });
    expect(r.totals).toMatchObject({ all: 2, shown: 2 });
    expect(r.items.find((i) => i.name === "Boris")).toMatchObject({ stage: "NEW", ownerId: owner });
  });

  it("narrows by owner, warmth and source, and finds the ones whose next step is due", async () => {
    await raw.contact.updateMany({ where: { firstName: "Boris" }, data: { ownerId: partner, temperature: "COLD", source: "Telegram", nextStepAt: new Date("2026-11-04T00:00:00.000Z"), nextStep: "Write" } });
    const now = new Date("2026-11-04T12:00:00.000Z");
    expect((await listPeople(owner, ws.id, { due: "0", ownerId: partner }, now)).items.map((i) => i.name)).toEqual(["Boris"]);
    expect((await listPeople(owner, ws.id, { due: "0", temperature: "COLD" }, now)).items.map((i) => i.name)).toEqual(["Boris"]);
    expect((await listPeople(owner, ws.id, { due: "0", source: "Telegram" }, now)).items.map((i) => i.name)).toEqual(["Boris"]);
    expect((await listPeople(owner, ws.id, { due: "1" }, now)).items.map((i) => i.name)).toEqual(["Boris"]); // due today
    expect((await listPeople(owner, ws.id, { due: "1" }, new Date("2026-11-03T12:00:00.000Z"))).items).toEqual([]); // not yet due the day before
    expect((await listPeople(owner, ws.id, { due: "0", q: "kowal" }, now)).items.map((i) => i.name)).toEqual(["Anna Kowalska"]);
  });

  it("someone declined or silent is not due, however old their next step", async () => {
    await raw.contact.updateMany({ where: { firstName: "Boris" }, data: { stage: "NO_REPLY" } });
    expect((await listPeople(owner, ws.id, { due: "1" }, new Date("2026-11-04T12:00:00.000Z"))).items).toEqual([]);
    await raw.contact.updateMany({ where: { firstName: "Boris" }, data: { stage: "NEW" } });
  });

  it("due is the person's own today: in Auckland it is already the 5th", async () => {
    await raw.user.update({ where: { id: owner }, data: { timezone: "Pacific/Auckland" } });
    await raw.contact.updateMany({ where: { firstName: "Boris" }, data: { nextStepAt: new Date("2026-11-05T00:00:00.000Z") } });
    const early = new Date("2026-11-04T12:00:00.000Z"); // 01:00 on the 5th in Auckland
    expect((await listPeople(owner, ws.id, { due: "1" }, early)).items.map((i) => i.name)).toEqual(["Boris"]);
    await raw.user.update({ where: { id: owner }, data: { timezone: "UTC" } });
    expect((await listPeople(owner, ws.id, { due: "1" }, early)).items).toEqual([]);
  });
});

describe("the list of a hundred names", () => {
  it("adds a pasted list in one go, with what they start with, and skips people already there", async () => {
    const people = [{ name: "Vera Plisunova" }, { name: "Egor Potapov", telegram: "@egor", note: "met at the fair" }, { name: "Anna Kowalska" }, { name: "Vera Plisunova" }, { name: "Lena K", phone: "+48 600 111 222" }];
    const r = await addPeople(owner, ws.id, { people, stage: "NEW", temperature: "WARM", source: "Сарафан", interests: ["Wellness"], country: "Poland", typeTag: null });
    expect(r.created).toBe(3);
    expect(r.skipped).toEqual(["Anna Kowalska", "Vera Plisunova"]); // already in the funnel; the same name twice in the list counts once
    const egor = await raw.contact.findFirstOrThrow({ where: { firstName: "Egor" } });
    expect(egor).toMatchObject({ stage: "NEW", temperature: "WARM", source: "Сарафан", interests: ["Wellness"], country: "Poland", ownerId: owner });
    expect(egor.messengers).toEqual({ telegram: "@egor" });
    expect((await raw.crmActivity.findFirstOrThrow({ where: { contactId: egor.nodeId } })).body).toBe("met at the fair");
    expect(await raw.contactStageEvent.count({ where: { contactNodeId: egor.nodeId } })).toBe(1);

    const again = await addPeople(owner, ws.id, { people, stage: "NEW" });
    expect(again.created).toBe(0); // pasted again: nobody is doubled
    expect(again.skipped).toHaveLength(5);
  });

  it("puts the list on someone else's desk when asked, but only a member of the workspace", async () => {
    const r = await addPeople(owner, ws.id, { people: [{ name: "For Partner One" }], stage: "FIRST_CONTACT", ownerId: partner });
    expect(r.created).toBe(1);
    expect((await raw.contact.findFirstOrThrow({ where: { firstName: "For" } })).ownerId).toBe(partner);
    const stranger = (await raw.user.create({ data: { email: "s@x.io", name: "S" } })).id;
    await expect(addPeople(owner, ws.id, { people: [{ name: "Nope" }], stage: "NEW", ownerId: stranger })).rejects.toMatchObject({ code: "invalid_owner" });
  });

  it("three hundred names take a few database calls, not several per person", async () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ name: `Test Person${i}` }));
    holder.ops = 0;
    const r = await addPeople(owner, ws.id, { people: many, stage: "NEW" });
    expect(r.created).toBe(300);
    expect(holder.ops).toBeLessThan(30);
  }, 60_000);

  it("refuses people who cannot read or write the CRM", async () => {
    const m = await raw.membership.findUniqueOrThrow({ where: { userId_workspaceId: { userId: partner, workspaceId: ws.id } } });
    await raw.membership.update({ where: { id: m.id }, data: { crmAccess: false } });
    await expect(addPeople(partner, ws.id, { people: [{ name: "x y" }], stage: "NEW" })).rejects.toMatchObject({ status: 403 });
    await expect(listPeople(partner, ws.id, { due: "0" })).rejects.toMatchObject({ status: 403 });
    await raw.membership.update({ where: { id: m.id }, data: { crmAccess: true } });
  });
});

describe("importing a sheet kept the way a team keeps it", () => {
  const sheet = [
    "П или Б,ФИО,Прогрев,Этап,Презентация,Решение,Чья прямая ссылка,Страна,Комментарий,Влияние",
    "Б,Стас Тест,Холодный,Видеозвонок,Да,Пока нет,,Португалия,,1",
    "П,Валерия Тест,Теплый,Оффлайн встреча,Да,Часть команды,Андрей,Польша,хочет в команду,6",
    "Б,Милена Тест,Теплый,Запланировать!!!,Нет,Пока нет,,,,10",
    "Б,Леша Тест,Средний,Видеозвонок,Да,Думает,,Беларусь,,2",
    "Б,Ира Тест,Средний,Что-то своё,Нет,Пока наблюдает,,,,",
  ].join("\n");

  it("recognises the columns, and the preview shows the funnel it understood", async () => {
    const p = await previewImport(owner, ws.id, bytes(sheet), { entity: "contacts", policy: "skip" });
    expect(p.mapping).toMatchObject({ typeTag: "П или Б", fullName: "ФИО", temperature: "Прогрев", stage: "Этап", decision: "Решение", sponsorName: "Чья прямая ссылка", country: "Страна", notes: "Комментарий", influence: "Влияние" });
    expect(p.summary).toMatchObject({ created: 5, errorCount: 0 });
    const byName = Object.fromEntries(p.sample.map((r) => [(r.record as unknown as { firstName: string }).firstName, r.record as unknown as Record<string, unknown>]));
    expect(byName["Стас"]).toMatchObject({ stage: "PRESENTATION", temperature: "COLD", typeTag: "BUSINESS", country: "Португалия", influence: 1 });
    expect(byName["Валерия"]).toMatchObject({ stage: "PARTNER", temperature: "WARM", typeTag: "TRAVEL", sponsorName: "Андрей" });
    expect(byName["Леша"]).toMatchObject({ stage: "DECIDING", temperature: "WARM" });
  });

  it("creates the people with their stage, warmth, country and the plan to schedule a presentation", async () => {
    const r = await commitImport(owner, ws.id, bytes(sheet), { entity: "contacts", policy: "skip" });
    expect(r).toMatchObject({ created: 5, errorCount: 0 });
    const get = (first: string) => raw.contact.findFirstOrThrow({ where: { firstName: first } });
    expect(await get("Валерия")).toMatchObject({ stage: "PARTNER", temperature: "WARM", typeTag: "TRAVEL", sponsorName: "Андрей", country: "Польша", influence: 6 });
    expect(await get("Милена")).toMatchObject({ stage: "WARMING", nextStep: "Запланировать презентацию" });
    const ira = await get("Ира");
    expect(ira.stage).toBe("WARMING"); // "Что-то своё" says nothing the funnel knows, but "Пока наблюдает" is a person who is watching
    const note = await raw.crmActivity.findFirstOrThrow({ where: { contactId: ira.nodeId } });
    expect(note.body).toContain("Этап: Что-то своё"); // what could not be read is kept, not lost
    expect(note.body).toContain("Решение: Пока наблюдает");
    expect(await raw.contactStageEvent.count({ where: { contactNodeId: (await get("Валерия")).nodeId } })).toBe(1);
  });

  it("importing it again changes nobody, and an update only sets what the file says", async () => {
    const again = await commitImport(owner, ws.id, bytes(sheet), { entity: "contacts", policy: "skip" });
    expect(again.created).toBe(0);
    await raw.contact.updateMany({ where: { firstName: "Леша" }, data: { source: "Instagram", interests: ["Wellness"] } });
    const upd = await commitImport(owner, ws.id, bytes("ФИО,Влияние\nЛеша Тест,9"), { entity: "contacts", policy: "update" });
    expect(upd).toMatchObject({ updated: 1, created: 0 });
    expect(await raw.contact.findFirstOrThrow({ where: { firstName: "Леша" } })).toMatchObject({ influence: 9, source: "Instagram", interests: ["Wellness"], stage: "DECIDING" });
  });
});

describe("priority: travel or business", () => {
  it("takes the letters of the sheets and stores a code, filters by it, and refuses what it cannot read", async () => {
    const t = await createContact(owner, ws.id, { ...base, firstName: "Pri-T", typeTag: "п" as never });
    const b = await createContact(owner, ws.id, { ...base, firstName: "Pri-B", typeTag: "Business" as never });
    expect(t.typeTag).toBe("TRAVEL");
    expect(b.typeTag).toBe("BUSINESS");
    const { patchContactSchema } = await import("@/server/services/crm/contacts");
    expect(patchContactSchema.safeParse({ typeTag: "Б" }).data).toEqual({ typeTag: "BUSINESS" });
    expect(patchContactSchema.safeParse({ typeTag: "" }).data).toEqual({ typeTag: null });
    expect(patchContactSchema.safeParse({ typeTag: "whatever" }).success).toBe(false);
    const travel = (await listPeople(owner, ws.id, { due: "0", priority: "TRAVEL" })).items.map((i) => i.name);
    expect(travel).toContain("Pri-T");
    expect(travel).not.toContain("Pri-B");
    await updateContact(owner, t.id, { typeTag: null });
    expect((await getContact(owner, t.id)).typeTag).toBeNull();
  });
});
