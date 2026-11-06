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
import { createActivity } from "@/server/services/crm/activities";
import { createContact, getContact, markReplied } from "@/server/services/crm/contacts";
import { findSilentContacts } from "@/server/services/crm/silence";

const NOW = new Date("2026-11-03T12:00:00.000Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let stranger: string;
let ws: { id: string };
let valentin: string;

const base = { emails: [], phones: [], messengers: {}, allowDuplicate: false, consentGiven: true };

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  stranger = (await t.db.user.create({ data: { email: "s@x.io", name: "Stranger" } })).id;
  ws = await createWorkspace(owner, "MWR");
  valentin = (await createContact(owner, ws.id, { ...base, firstName: "Валентин", ownerId: owner, stage: "NEW" })).id;
  await raw.contact.update({ where: { nodeId: valentin }, data: { lastContactedAt: ago(40) } });
}, 120_000);
afterAll(async () => close?.());

describe("The replied button", () => {
  it("stamps repliedAt, leaves a trace in the log and shows it on the card", async () => {
    const card = await markReplied(owner, valentin, ago(30));
    expect(card.repliedAt).toEqual(ago(30));
    expect(await raw.activityLog.count({ where: { nodeId: valentin, action: "contact.replied", actorId: owner } })).toBe(1);
    expect((await getContact(owner, valentin)).repliedAt).toEqual(ago(30));
  });

  it("turns into a red flag after 24 hours, and a touch of ours clears it", async () => {
    const flagged = await findSilentContacts(owner, ws.id, NOW);
    expect(flagged.map((c) => [c.name, c.hit.kind])).toEqual([["Валентин", "replied"]]);

    await createActivity(owner, ws.id, { type: "MESSAGE", subject: "Ответ Валентину", body: "Привет!", contactId: valentin });
    expect(await findSilentContacts(owner, ws.id, new Date(Date.now() + 60_000))).toEqual([]);
  });

  it("pressing it again moves the moment forward", async () => {
    const card = await markReplied(owner, valentin, ago(2));
    expect(card.repliedAt).toEqual(ago(2));
  });

  it("is refused for someone who has no access to the workspace", async () => {
    await expect(markReplied(stranger, valentin)).rejects.toMatchObject({ status: 404 });
    expect((await raw.contact.findUniqueOrThrow({ where: { nodeId: valentin } })).repliedAt).toEqual(ago(2));
  });
});

describe("The reply is a record, not just a flag", () => {
  it("writes an incoming message with the words, and does not count as a touch of ours", async () => {
    const id = (await createContact(owner, ws.id, { ...base, firstName: "Леша", lastName: "Барабанов", ownerId: owner, stage: "NEW" })).id;
    const card = await markReplied(owner, id, ago(5), { text: "Интересно, расскажи подробнее", subject: "Ответил(а)" });
    expect(card.repliedAt).toEqual(ago(5));
    expect(card.lastContactedAt).toBeNull(); // still "no touch of ours recorded": the reply must not hide that
    const rows = await raw.crmActivity.findMany({ where: { contactId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "MESSAGE", subject: "Ответил(а)", body: "Интересно, расскажи подробнее", outcome: "REPLIED", signals: ["INBOUND"] });
    expect(rows[0]?.completedAt).toEqual(ago(5));
  });

  it("a new name that answers becomes a first contact; someone further along keeps the stage", async () => {
    const fresh = (await createContact(owner, ws.id, { ...base, firstName: "Новый", ownerId: owner, stage: "NEW" })).id;
    const warm = (await createContact(owner, ws.id, { ...base, firstName: "Тёплый", ownerId: owner, stage: "WARMING" })).id;
    const quiet = (await createContact(owner, ws.id, { ...base, firstName: "Молчун", ownerId: owner, stage: "NO_REPLY" })).id;
    await markReplied(owner, fresh);
    await markReplied(owner, warm);
    await markReplied(owner, quiet);
    const stage = async (id: string) => (await raw.contact.findUniqueOrThrow({ where: { nodeId: id } })).stage;
    expect(await stage(fresh)).toBe("FIRST_CONTACT");
    expect(await stage(warm)).toBe("WARMING");
    expect(await stage(quiet)).toBe("FIRST_CONTACT");
  });
});
