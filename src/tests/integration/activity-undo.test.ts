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
import { createActivity, deleteActivity } from "@/server/services/crm/activities";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let ws: { id: string };
const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };
const message = (contactId: string, subject: string) => createActivity(owner, ws.id, { type: "MESSAGE", subject, body: "text", contactId, completed: true });

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Лидер" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO", contactPrivacy: "OPEN" } });
});
afterAll(async () => close());

describe("taking a touch back", () => {
  it("puts the last touch of the person back to the one before, and to nothing when there was none", async () => {
    const id = (await createContact(owner, ws.id, { ...base, firstName: "Анна" })).id;
    expect((await raw.contact.findUniqueOrThrow({ where: { nodeId: id } })).lastContactedAt).toBeNull();

    const first = await message(id, "first");
    const t1 = (await raw.contact.findUniqueOrThrow({ where: { nodeId: id } })).lastContactedAt;
    expect(t1).not.toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    const second = await message(id, "second");
    const t2 = (await raw.contact.findUniqueOrThrow({ where: { nodeId: id } })).lastContactedAt;
    expect(t2!.getTime()).toBeGreaterThan(t1!.getTime());

    await deleteActivity(owner, second.id);
    expect((await raw.contact.findUniqueOrThrow({ where: { nodeId: id } })).lastContactedAt).toEqual(t1);
    await deleteActivity(owner, first.id);
    expect((await raw.contact.findUniqueOrThrow({ where: { nodeId: id } })).lastContactedAt).toBeNull();
  });

  it("leaves the last touch alone when the one taken back is not a touch", async () => {
    const id = (await createContact(owner, ws.id, { ...base, firstName: "Борис" })).id;
    await message(id, "m");
    const at = (await raw.contact.findUniqueOrThrow({ where: { nodeId: id } })).lastContactedAt;
    const note = await createActivity(owner, ws.id, { type: "NOTE", subject: "n", contactId: id, completed: true });
    await deleteActivity(owner, note.id);
    expect((await raw.contact.findUniqueOrThrow({ where: { nodeId: id } })).lastContactedAt).toEqual(at);
  });
});
