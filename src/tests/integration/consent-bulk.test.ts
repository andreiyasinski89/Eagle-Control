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
import { createContact, setConsent } from "@/server/services/crm/contacts";
import { ATTESTED_SOURCE, bulkAttestConsent } from "@/server/services/crm/consent-bulk";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let peer: string;
let ws: { id: string };
const ids: Record<string, string> = {};

const base = { emails: [], phones: [], messengers: {}, allowDuplicate: false };
const make = async (key: string, o: { owner: string; consent?: boolean }) => {
  ids[key] = (await createContact(o.owner, ws.id, { ...base, firstName: key, ownerId: o.owner, consentGiven: o.consent ?? false })).id;
};

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  peer = (await t.db.user.create({ data: { email: "p@x.io", name: "Peer" } })).id;
  ws = await createWorkspace(owner, "MWR");
  await t.db.membership.create({ data: { userId: peer, workspaceId: ws.id, role: "MEMBER", crmAccess: true } });
  await make("Без согласия 1", { owner });
  await make("Без согласия 2", { owner });
  await make("Уже есть", { owner, consent: true });
  await make("Отозвал", { owner });
  await make("Чужой", { owner: peer });
  await setConsent(owner, ids["Отозвал"]!, true);
  await setConsent(owner, ids["Отозвал"]!, false); // withdrew
}, 120_000);
afterAll(async () => close?.());

describe("Bulk consent", () => {
  it("a dry run reports and writes nothing", async () => {
    const before = await raw.consentRecord.count();
    const r = await bulkAttestConsent(owner, ws.id, { ownerId: owner, apply: false });
    expect(r.toSet.map((c) => c.name)).toEqual(["Без согласия 1", "Без согласия 2"]);
    expect(r.skippedRevoked.map((c) => c.name)).toEqual(["Отозвал"]);
    expect(r).toMatchObject({ alreadyGiven: 1, applied: 0 });
    expect(await raw.consentRecord.count()).toBe(before);
    expect(await raw.contact.count({ where: { workspaceId: ws.id, consentGiven: true } })).toBe(1);
  });

  it("applying sets consent with an auditable record, skips whoever withdrew, and leaves other owners alone", async () => {
    const r = await bulkAttestConsent(owner, ws.id, { ownerId: owner, apply: true });
    expect(r.applied).toBe(2);
    for (const k of ["Без согласия 1", "Без согласия 2"]) {
      const c = await raw.contact.findUniqueOrThrow({ where: { nodeId: ids[k]! } });
      expect(c.consentGiven).toBe(true);
      expect(c.consentAt).not.toBeNull();
      expect(await raw.consentRecord.findMany({ where: { contactNodeId: ids[k]! } })).toEqual([expect.objectContaining({ purpose: "contact", source: ATTESTED_SOURCE, revokedAt: null })]);
    }
    expect((await raw.contact.findUniqueOrThrow({ where: { nodeId: ids["Отозвал"]! } })).consentGiven).toBe(false);
    expect((await raw.contact.findUniqueOrThrow({ where: { nodeId: ids["Чужой"]! } })).consentGiven).toBe(false);
  });

  it("is safe to run again", async () => {
    const r = await bulkAttestConsent(owner, ws.id, { ownerId: owner, apply: true });
    expect(r).toMatchObject({ applied: 0, alreadyGiven: 3 });
    expect(r.toSet).toEqual([]);
    expect(await raw.consentRecord.count({ where: { contactNodeId: ids["Без согласия 1"]! } })).toBe(1);
  });

  it("refuses someone who may not write to the CRM", async () => {
    const outsider = (await raw.user.create({ data: { email: "z@x.io" } })).id;
    await expect(bulkAttestConsent(outsider, ws.id, { apply: true })).rejects.toMatchObject({ status: 404 });
  });
});
