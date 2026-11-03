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
