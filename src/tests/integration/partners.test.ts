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
import { createContact, getContact, updateContact } from "@/server/services/crm/contacts";
import { listPeople } from "@/server/services/crm/people";
import { getHandoffCard, listPartners, transferContacts } from "@/server/services/crm/partners";
import { getNetwork } from "@/server/services/crm/network";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let friend: string;
let outsider: string;
let ws: { id: string };

const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };
const person = async (firstName: string, extra: Record<string, unknown> = {}) => (await createContact(owner, ws.id, { ...base, firstName, ...extra })).id;
const heldNames = async (held: string) => (await listPeople(owner, ws.id, { due: "0", held })).items.map((i) => i.name).sort();

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db.$extends({ query: { $allOperations: async ({ args, query }) => { holder.ops++; return query(args); } } }) as unknown as PrismaClient;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  friend = (await t.db.user.create({ data: { email: "f@x.io", name: "Friend" } })).id;
  outsider = (await t.db.user.create({ data: { email: "x@x.io", name: "Out" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await createWorkspace(outsider, "Other");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  await t.db.membership.create({ data: { userId: friend, workspaceId: ws.id, role: "MEMBER" } });
}, 120_000);
afterAll(async () => close?.());

describe("partners and the sponsor tree", () => {
  let top: string;
  let mid: string;
  let low: string;
  let plain: string;

  it("builds a line of sponsors from partners only, with no loops", async () => {
    top = await person("Top", { stage: "PARTNER" });
    mid = await person("Mid", { stage: "PARTNER", sponsorId: top });
    low = await person("Low", { stage: "PARTNER", sponsorId: mid });
    plain = await person("Plain", { stage: "WARMING", sponsorId: mid });
    await expect(person("Bad", { sponsorId: plain })).rejects.toMatchObject({ code: "not_partner" });
    await expect(updateContact(owner, top, { sponsorId: low })).rejects.toMatchObject({ code: "sponsor_loop" });
    await expect(updateContact(owner, top, { sponsorId: top })).rejects.toMatchObject({ code: "sponsor_loop" });
    await expect(updateContact(owner, low, { linkedUserId: outsider })).rejects.toMatchObject({ code: "invalid_linked_user" });
  });

  it("lists the team: who is under whom, how big each line is", async () => {
    const { items } = await listPartners(owner, ws.id);
    const by = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(items.map((i) => i.name).sort()).toEqual(["Low", "Mid", "Top"]);
    expect(by.Top).toMatchObject({ parentId: null, direct: 1, team: 3, partnersBelow: 2 });
    expect(by.Mid).toMatchObject({ parentId: top, direct: 2, team: 2, partnersBelow: 1 });
    expect(by.Low).toMatchObject({ parentId: mid, direct: 0, team: 0 });
  });

  it("a person under a non-partner climbs to the nearest partner above", async () => {
    const deep = await person("Deep", { stage: "PARTNER", sponsorId: low });
    await updateContact(owner, deep, { stage: "WARMING" });
    await updateContact(owner, deep, { stage: "PARTNER" });
    const { items } = await listPartners(owner, ws.id);
    expect(items.find((i) => i.name === "Deep")).toMatchObject({ parentId: low });
  });
});

describe("handing people to partners", () => {
  let a: string;
  let b: string;
  let c: string;
  let helper: string;
  let linked: string;
  let plain: string;

  it("hands over many at once, keeps a history and a note, and a second hand-over to the same partner changes nothing", async () => {
    a = await person("Alice");
    b = await person("Boris");
    c = await person("Clara");
    helper = (await listPartners(owner, ws.id)).items.find((i) => i.name === "Low")!.id;
    plain = await person("Plain2");
    holder.ops = 0;
    const r = await transferContacts(owner, ws.id, { ids: [a, b, c], toPartnerId: helper, note: "Met at the fair" });
    expect(r).toMatchObject({ moved: 3, skipped: 0 });
    expect(holder.ops).toBeLessThan(15);
    expect(await heldNames(helper)).toEqual(["Alice", "Boris", "Clara"]);
    expect(await heldNames("any")).toEqual(["Alice", "Boris", "Clara"]);
    expect(await transferContacts(owner, ws.id, { ids: [a, b], toPartnerId: helper })).toMatchObject({ moved: 0, skipped: 2 });
    const d = await getContact(owner, a);
    expect(d.heldById).toBe(helper);
    expect(d.transfers).toEqual([expect.objectContaining({ from: null, to: "Low", note: "Met at the fair", by: "Owner" })]);
    const notes = await raw.crmActivity.findMany({ where: { contactId: a, type: "NOTE" } });
    expect(notes.map((n) => n.subject)).toContain("Handed over to Low");
  });

  it("a partner with an account receives the people as their own; taking them back returns them to the one who took them", async () => {
    linked = (await listPartners(owner, ws.id)).items.find((i) => i.name === "Mid")!.id;
    await updateContact(owner, linked, { linkedUserId: friend });
    await transferContacts(owner, ws.id, { ids: [b], toPartnerId: linked });
    expect(await raw.contact.findUnique({ where: { nodeId: b }, select: { ownerId: true, heldById: true } })).toEqual({ ownerId: friend, heldById: linked });
    await transferContacts(owner, ws.id, { ids: [b], toPartnerId: null, note: "Back" });
    expect(await raw.contact.findUnique({ where: { nodeId: b }, select: { ownerId: true, heldById: true } })).toEqual({ ownerId: owner, heldById: null });
    const h = (await getContact(owner, b)).transfers;
    expect(h.map((t) => [t.from, t.to])).toEqual([["Mid", null], ["Low", "Mid"], [null, "Low"]]);
    expect(await heldNames("none")).toContain("Boris");
  });

  it("only partners can receive, a person cannot be handed to themselves, and strangers cannot do it", async () => {
    await expect(transferContacts(owner, ws.id, { ids: [a], toPartnerId: plain })).rejects.toMatchObject({ code: "not_partner" });
    await expect(transferContacts(owner, ws.id, { ids: [a], toPartnerId: "nope" })).rejects.toMatchObject({ code: "invalid_partner" });
    expect(await transferContacts(owner, ws.id, { ids: [helper], toPartnerId: helper })).toMatchObject({ moved: 0 });
    await expect(transferContacts(outsider, ws.id, { ids: [a], toPartnerId: helper })).rejects.toBeTruthy();
    await expect(getHandoffCard(outsider, a)).rejects.toBeTruthy();
  });

  it("the handoff card holds the contact details and the last notes", async () => {
    await updateContact(owner, a, { phones: ["+48 600 111 222"], messengers: { telegram: "@alice" }, temperature: "HOT", interests: ["Travel"], nextStep: "Call" });
    const card = await getHandoffCard(owner, a);
    expect(card).toMatchObject({ name: "Alice", phones: ["+48 600 111 222"], telegram: "@alice", temperature: "HOT", interests: ["Travel"], nextStep: "Call" });
    expect(card.notes.at(-1)?.text).toBe("Met at the fair");
  });

  it("removing a partner leaves the people and the history, only the link goes", async () => {
    await raw.node.delete({ where: { id: helper } });
    const d = await getContact(owner, a);
    expect(d.heldById).toBeNull();
    expect(d.transfers).toHaveLength(1);
    expect(d.transfers[0]).toMatchObject({ to: null, note: "Met at the fair" });
  });
});

describe("network map data", () => {
  it("gives every person with the links the map needs, and is closed to strangers", async () => {
    const n = await getNetwork(owner, ws.id);
    expect(n.rootName).toBe("Owner");
    expect(n.truncated).toBe(false);
    expect(n.total).toBe(n.people.length);
    const mid = n.people.find((x) => x.name === "Mid");
    const top = n.people.find((x) => x.name === "Top");
    expect(mid).toMatchObject({ stage: "PARTNER", sponsorId: top?.id });
    expect(n.people.find((x) => x.name === "Alice")).toMatchObject({ stage: "NEW", heldById: null });
    await expect(getNetwork(outsider, ws.id)).rejects.toBeTruthy();
  });
});
