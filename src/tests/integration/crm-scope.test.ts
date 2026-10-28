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
import { createContact, getContact, listContacts, updateContact } from "@/server/services/crm/contacts";
import { listPeople } from "@/server/services/crm/people";
import { listPartners, transferContacts } from "@/server/services/crm/partners";
import { getNetwork } from "@/server/services/crm/network";
import { listGroups } from "@/server/services/crm/groups";
import { createActivity, listActivities } from "@/server/services/crm/activities";
import { createCompany, listCompanies } from "@/server/services/crm/companies";
import { updateMember } from "@/server/services/membership";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let anna: string; // own people
let boris: string; // his team
let eve: string; // below boris
let cora: string; // everything
let dave: string; // no CRM
let ws: { id: string };
const ids = {} as Record<"pAnna" | "pBoris" | "pEve" | "byOwner" | "byAnna" | "byBoris" | "byEve" | "viaBoris", string>;

const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };
const make = async (by: string, firstName: string, extra: Record<string, unknown> = {}) => (await createContact(by, ws.id, { ...base, firstName, ...extra })).id;
const names = async (u: string) => (await listPeople(u, ws.id, { due: "0" })).items.map((i) => i.name).sort();
const page = { page: 1, pageSize: 50 } as never;

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  const user = async (n: string) => (await t.db.user.create({ data: { email: `${n}@x.io`, name: n } })).id;
  owner = await user("owner");
  anna = await user("anna");
  boris = await user("boris");
  eve = await user("eve");
  cora = await user("cora");
  dave = await user("dave");
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO", contactPrivacy: "OPEN" } });
  const member = (userId: string, crmAccess: boolean, crmScope: "OWN" | "TEAM" | "ALL") => t.db.membership.create({ data: { userId, workspaceId: ws.id, role: "MEMBER", crmAccess, crmScope } });
  await member(anna, true, "OWN");
  await member(boris, true, "TEAM");
  await member(eve, true, "OWN");
  await member(cora, true, "ALL");
  await member(dave, false, "ALL");

  // Partner cards with accounts: boris leads eve; anna stands alone.
  ids.pAnna = await make(owner, "PAnna", { stage: "PARTNER", linkedUserId: anna });
  ids.pBoris = await make(owner, "PBoris", { stage: "PARTNER", linkedUserId: boris });
  ids.pEve = await make(owner, "PEve", { stage: "PARTNER", linkedUserId: eve, sponsorId: ids.pBoris });
  ids.byOwner = await make(owner, "ByOwner");
  ids.byAnna = await make(anna, "ByAnna");
  ids.byBoris = await make(boris, "ByBoris");
  ids.byEve = await make(eve, "ByEve");
  ids.viaBoris = await make(owner, "ViaBoris", { stage: "WARMING", sponsorId: ids.pBoris });
  await transferContacts(owner, ws.id, { ids: [ids.byOwner], toPartnerId: ids.pAnna }); // anna now holds ByOwner
  await createCompany(owner, ws.id, { legalName: "Big Co" } as never);
}, 120_000);
afterAll(async () => close?.());

describe("who sees which people", () => {
  it("the owner and a member with the whole CRM see everyone", async () => {
    const all = ["ByAnna", "ByBoris", "ByEve", "ByOwner", "PAnna", "PBoris", "PEve", "ViaBoris"];
    expect(await names(owner)).toEqual(all);
    expect(await names(cora)).toEqual(all);
  });
  it("a member with no CRM access sees nothing at all", async () => {
    await expect(listPeople(dave, ws.id, { due: "0" })).rejects.toMatchObject({ status: 403 });
  });
  it("'own' sees what they own, what their partner card holds, and the card itself", async () => {
    expect(await names(anna)).toEqual(["ByAnna", "ByOwner", "PAnna"]);
    expect(await names(eve)).toEqual(["ByEve", "PEve"]);
  });
  it("'team' sees their own people and the whole line below them, not the people beside", async () => {
    expect(await names(boris)).toEqual(["ByBoris", "ByEve", "PBoris", "PEve", "ViaBoris"]);
  });
  it("the totals, the table, the groups, the map and the team tree follow the same rule", async () => {
    expect((await listPeople(anna, ws.id, { due: "0" })).totals.all).toBe(3);
    expect((await listContacts(anna, ws.id, { page: 1, pageSize: 50, sort: "name", dir: "asc" } as never)).total).toBe(3);
    expect((await listGroups(anna, ws.id)).all).toBe(3);
    expect((await getNetwork(anna, ws.id)).people.map((p) => p.name).sort()).toEqual(["ByAnna", "ByOwner", "PAnna"]);
    expect((await listPartners(anna, ws.id)).items.map((p) => p.name)).toEqual(["PAnna"]);
    expect((await listPartners(boris, ws.id)).items.map((p) => p.name).sort()).toEqual(["PBoris", "PEve"]);
    expect((await listPartners(owner, ws.id)).items).toHaveLength(3);
  });
});

describe("what a scoped member cannot reach", () => {
  it("another person's card is a 404, to read and to change", async () => {
    await expect(getContact(anna, ids.byBoris)).rejects.toMatchObject({ status: 404 });
    await expect(updateContact(anna, ids.byBoris, { firstName: "Hacked" })).rejects.toMatchObject({ status: 404 });
    expect((await getContact(anna, ids.byAnna)).firstName).toBe("ByAnna");
    expect((await getContact(boris, ids.byEve)).firstName).toBe("ByEve");
  });
  it("they cannot hand over, group or write about people they do not see", async () => {
    expect(await transferContacts(anna, ws.id, { ids: [ids.byBoris], toPartnerId: ids.pAnna })).toMatchObject({ moved: 0 });
    await expect(transferContacts(anna, ws.id, { ids: [ids.byAnna], toPartnerId: ids.pBoris })).rejects.toMatchObject({ code: "invalid_partner" });
    await expect(createActivity(anna, ws.id, { type: "NOTE", subject: "x", contactId: ids.byBoris } as never)).rejects.toMatchObject({ status: 404 });
    await createActivity(anna, ws.id, { type: "NOTE", subject: "mine", contactId: ids.byAnna } as never);
    await createActivity(owner, ws.id, { type: "NOTE", subject: "theirs", contactId: ids.byBoris } as never);
    const seen = (await listActivities(anna, ws.id, page)).items.map((a) => a.subject);
    expect(seen).toContain("mine");
    expect(seen).not.toContain("theirs");
    expect((await listActivities(owner, ws.id, page)).total).toBeGreaterThanOrEqual(2);
  });
  it("companies, deals and reports belong to those who see the whole CRM", async () => {
    await expect(listCompanies(anna, ws.id, page)).rejects.toMatchObject({ status: 403 });
    expect((await listCompanies(cora, ws.id, page)).total).toBe(1);
  });
});

describe("giving and taking access", () => {
  it("raising a member to everything shows them all, and taking it away shows nothing", async () => {
    const admin = { userId: owner, role: "OWNER" as const };
    await updateMember(admin, ws.id, anna, { crmLevel: "ALL" });
    expect((await names(anna)).length).toBe(8);
    await updateMember(admin, ws.id, anna, { crmLevel: "TEAM" });
    expect(await names(anna)).toEqual(["ByAnna", "ByOwner", "PAnna"]);
    await updateMember(admin, ws.id, anna, { crmLevel: "NONE" });
    await expect(listPeople(anna, ws.id, { due: "0" })).rejects.toMatchObject({ status: 403 });
    const m = await raw.membership.findUniqueOrThrow({ where: { userId_workspaceId: { userId: anna, workspaceId: ws.id } } });
    expect(m.crmAccess).toBe(false);
    const log = await raw.activityLog.findMany({ where: { workspaceId: ws.id, action: "member.crm_level" }, orderBy: { createdAt: "asc" } });
    expect(log.map((l) => (l.diff as { to: string }).to)).toEqual(["ALL", "TEAM", "NONE"]);
  });
});
