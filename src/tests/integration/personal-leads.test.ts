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
vi.hoisted(() => {
  process.env.APP_URL = "https://meetowl.test";
});

import { createWorkspace } from "@/server/services/workspace";
import { createContact } from "@/server/services/crm/contacts";
import { ingestLead } from "@/server/services/crm/lead-ingest";
import { getTouchQueue } from "@/server/services/crm/touch-queue";
import { getOrCreateReferralLink } from "@/server/services/signup";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let amb: string;
let ws: { id: string };
let code: string;
const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };
const opts = { workspaceId: "", source: "webhook", sourceLabel: "Quiz" };
const lead = (body: Record<string, unknown>, extra: Partial<typeof opts> & { idempotencyKey?: string } = {}) => ingestLead({ ...opts, workspaceId: ws.id, ...extra }, body);

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Лидер", timezone: "UTC", locale: "ru" } })).id;
  amb = (await t.db.user.create({ data: { email: "a@x.io", name: "Амбассадор", timezone: "UTC", locale: "ru" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO", contactPrivacy: "PRIVATE" } });
  await t.db.membership.create({ data: { userId: amb, workspaceId: ws.id, role: "MEMBER", crmAccess: true, crmScope: "OWN" } });
  code = (await getOrCreateReferralLink(amb, ws.id)).code;
});
afterAll(async () => close());

describe("a lead through somebody's own link", () => {
  it("becomes a person of that member, a new lead with the quiz answers in the note, and no deal", async () => {
    const r = await lead({ name: "Анна Новая", phone: "+48 600 111 222", telegram: "@anna_new", ref: code, "Вопрос 1": "Хочу доход", "Вопрос 2": "10 часов" });
    expect(r.status).toBe("created");
    expect(r.dealId).toBeNull();
    const c = await raw.contact.findUniqueOrThrow({ where: { nodeId: r.contactId! } });
    expect(c).toMatchObject({ ownerId: amb, stage: "NEW", source: "Quiz" });
    expect((c.messengers as { telegram: string }).telegram).toBe("@anna_new");
    expect(await raw.deal.count()).toBe(0);
    const note = await raw.crmActivity.findFirstOrThrow({ where: { contactId: r.contactId! } });
    expect(note.body).toContain("Хочу доход");
    expect(note.body).toContain("10 часов");
  });

  it("is told to the member and sits at the head of today's touches with the reminder", async () => {
    const n = await raw.notification.findFirst({ where: { userId: amb, kind: "lead" } });
    expect(JSON.stringify(n?.payload)).toContain("Анна Новая");
    const q = (await getTouchQueue(amb, ws.id, new Date(Date.now() + 60_000))).items;
    const item = q.find((i) => i.firstName === "Анна");
    expect(item).toBeTruthy();
    expect(item?.nextStep).toBe("Новый: ответить в течение часа");
  });

  it("is not seen by the leader in a private workspace (the person is the member's own)", async () => {
    const q = (await getTouchQueue(owner, ws.id, new Date(Date.now() + 60_000))).items;
    expect(q.find((i) => i.firstName === "Анна")).toBeUndefined();
  });
});

describe("a lead without a label or with a wrong one", () => {
  it("goes to the leader of the workspace", async () => {
    const a = await lead({ name: "Без Метки", email: "nolabel@x.io" });
    const b = await lead({ name: "Чужая Метка", email: "wrong@x.io", ref: "ZZZZZZZZZZ" });
    for (const r of [a, b]) {
      const c = await raw.contact.findUniqueOrThrow({ where: { nodeId: r.contactId! } });
      expect(c.ownerId).toBe(owner);
    }
  });
});

describe("doubles", () => {
  it("are found by phone, by e-mail and by Telegram name however it is typed", async () => {
    const first = await lead({ name: "Дубль", email: "dup@x.io", phone: "+48 600 333 444", telegram: "dup_tg", ref: code });
    expect(first.status).toBe("created");
    for (const again of [{ email: "DUP@x.io" }, { phone: "0048600333444" }, { telegram: "https://t.me/Dup_TG" }, { telegram: "@dup_tg" }]) {
      const r = await lead({ name: "Дубль 2", ref: code, ...again });
      expect(r.status).toBe("duplicate");
      expect(r.contactId).toBe(first.contactId);
    }
    expect(await raw.contact.count({ where: { firstName: { startsWith: "Дубль" } } })).toBe(1);
  });

  it("also stop a person typed in by hand with a Telegram name already in the list", async () => {
    await createContact(amb, ws.id, { ...base, firstName: "Ручной", messengers: { telegram: "@Hand_Made" } });
    await expect(createContact(amb, ws.id, { ...base, firstName: "Ручной 2", messengers: { telegram: "t.me/hand_made" } })).rejects.toMatchObject({ code: "duplicate_contact" });
  });

  it("keep one entry per retry with the same key", async () => {
    const a = await lead({ name: "Повтор", email: "retry@x.io", ref: code }, { idempotencyKey: "k-1" });
    const b = await lead({ name: "Повтор", email: "retry@x.io", ref: code }, { idempotencyKey: "k-1" });
    expect(b.status).toBe("duplicate");
    expect(b.contactId).toBe(a.contactId);
  });
});
