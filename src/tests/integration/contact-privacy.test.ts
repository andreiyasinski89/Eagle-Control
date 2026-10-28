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
import { createContact, contactDuplicateGroups, gdprErase, gdprExport, getContact, listContacts, updateContact } from "@/server/services/crm/contacts";
import { listPeople } from "@/server/services/crm/people";
import { listPartners } from "@/server/services/crm/partners";
import { getNetwork } from "@/server/services/crm/network";
import { createActivity, listActivities } from "@/server/services/crm/activities";
import { createCompany, getCompany } from "@/server/services/crm/companies";
import { getClientMap } from "@/server/services/crm/client-map";
import { exportContactsCsv } from "@/server/services/crm/imports";
import { mergeContacts } from "@/server/services/crm/merge";
import { grantContactShare, grantGroupShare, listContactShares, revokeShare } from "@/server/services/crm/shares";
import { createGroup } from "@/server/services/crm/groups";
import { getMyDay } from "@/server/services/crm/my-day";
import { getTeamActivity } from "@/server/services/crm/team-activity";
import { getContactPrivacy, setContactPrivacy } from "@/server/services/crm/privacy";
import { calendarQuerySchema, workspaceCalendar } from "@/server/services/nodes/views";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string; // owner of the workspace: the leader
let admin: string;
let anna: string; // a partner with her own people
let boris: string; // the 'team' level: leads eve
let eve: string;
let cora: string; // the whole CRM
let ws: { id: string };
let company: string;
const ids = {} as Record<"byOwner" | "byAnna" | "byBoris" | "byEve" | "pBoris" | "pEve", string>;

const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };
const make = async (by: string, firstName: string, extra: Record<string, unknown> = {}) => (await createContact(by, ws.id, { ...base, firstName, ...extra })).id;
const names = async (u: string) => (await listPeople(u, ws.id, { due: "0" })).items.map((i) => i.name).sort();
const q = () => calendarQuerySchema.parse({ from: "2026-11-01", to: "2026-11-30" });

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  const user = async (n: string) => (await t.db.user.create({ data: { email: `${n}@x.io`, name: n, timezone: "UTC" } })).id;
  owner = await user("owner");
  admin = await user("admin");
  anna = await user("anna");
  boris = await user("boris");
  eve = await user("eve");
  cora = await user("cora");
  ws = await createWorkspace(owner, "Acme"); // a new workspace is private
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  await t.db.membership.create({ data: { userId: admin, workspaceId: ws.id, role: "ADMIN", crmAccess: true } });
  const member = (userId: string, crmScope: "OWN" | "TEAM" | "ALL") => t.db.membership.create({ data: { userId, workspaceId: ws.id, role: "MEMBER", crmAccess: true, crmScope } });
  await member(anna, "OWN");
  await member(boris, "TEAM");
  await member(eve, "OWN");
  await member(cora, "ALL");

  ids.pBoris = await make(owner, "PBoris", { stage: "PARTNER", linkedUserId: boris });
  ids.pEve = await make(owner, "PEve", { stage: "PARTNER", linkedUserId: eve, sponsorId: ids.pBoris });
  ids.byOwner = await make(owner, "ByOwner");
  ids.byAnna = await make(anna, "ByAnna", { emails: ["anna.friend@x.io"] });
  ids.byBoris = await make(boris, "ByBoris");
  ids.byEve = await make(eve, "ByEve");
  company = (await createCompany(owner, ws.id, { legalName: "Big Co" } as never)).id;
  await raw.contact.updateMany({ where: { nodeId: { in: [ids.byOwner, ids.byAnna] } }, data: { companyId: company } });
  // Anna has a call and a meeting planned; the owner has one too
  await createActivity(anna, ws.id, { type: "CALL", subject: "Call Anna's friend", dueAt: "2026-11-10T10:00:00.000Z", completed: false, contactId: ids.byAnna });
  await createActivity(owner, ws.id, { type: "CALL", subject: "Call the owner's friend", dueAt: "2026-11-11T10:00:00.000Z", completed: false, contactId: ids.byOwner });
}, 120_000);
afterAll(async () => close?.());

describe("a private workspace (the default)", () => {
  it("every new workspace is private, and everybody can see that", async () => {
    expect(await getContactPrivacy(anna, ws.id)).toEqual({ mode: "PRIVATE", canChange: false });
    expect(await getContactPrivacy(owner, ws.id)).toEqual({ mode: "PRIVATE", canChange: true });
  });

  it("nobody sees another person's people, whatever their role or level: the owner, the admin and the whole-CRM member included", async () => {
    expect(await names(owner)).toEqual(["ByOwner", "PBoris", "PEve"]);
    expect(await names(admin)).toEqual([]);
    expect(await names(cora)).toEqual([]);
    expect(await names(anna)).toEqual(["ByAnna"]);
    expect(await names(eve)).toEqual(["ByEve", "PEve"]);
  });

  it("the 'team' level shows the line below only as people of the leader's own, never the people of those below", async () => {
    expect(await names(boris)).toEqual(["ByBoris", "PBoris"]); // not ByEve, not PEve
    expect((await listPartners(boris, ws.id)).items.map((p) => p.name)).toEqual(["PBoris"]);
  });

  it("another person's card is a 404 to read and to change, through every door: card, list, table, map", async () => {
    for (const who of [owner, admin, cora]) {
      await expect(getContact(who, ids.byAnna)).rejects.toMatchObject({ status: 404 });
      await expect(updateContact(who, ids.byAnna, { firstName: "Hacked" })).rejects.toMatchObject({ status: 404 });
    }
    await expect(getContact(boris, ids.byEve)).rejects.toMatchObject({ status: 404 });
    for (const who of [owner, admin, cora, boris]) {
      const table = await listContacts(who, ws.id, { page: 1, pageSize: 50, sort: "name", dir: "asc" } as never);
      expect(table.items.map((c) => c.firstName)).not.toContain("ByAnna");
      expect((await getNetwork(who, ws.id)).people.map((p) => p.name)).not.toContain("ByAnna");
    }
    expect((await getContact(anna, ids.byAnna)).firstName).toBe("ByAnna");
  });

  it("their activities are hidden too: the list, the calendar and My day", async () => {
    for (const who of [owner, admin, cora]) {
      const subjects = (await listActivities(who, ws.id, { page: 1, pageSize: 50 } as never)).items.map((a) => a.subject);
      expect(subjects).not.toContain("Call Anna's friend");
    }
    const cal = (await workspaceCalendar(owner, ws.id, q())).items.map((i) => i.title);
    expect(cal).toContain("Call the owner's friend");
    expect(cal).not.toContain("Call Anna's friend");
    const calCora = (await workspaceCalendar(cora, ws.id, q())).items.map((i) => i.title);
    expect(calCora).not.toContain("Call Anna's friend");
    const day = await getMyDay(owner, ws.id, new Date("2026-11-10T08:00:00.000Z"));
    expect(day.scheduled.map((s) => s.subject)).not.toContain("Call Anna's friend");
  });

  it("the CSV export, the duplicate list and a merge cover only the people one may see", async () => {
    const csv = await exportContactsCsv(owner, ws.id, { page: 1, pageSize: 50, sort: "name", dir: "asc" } as never);
    expect(csv).toContain("ByOwner");
    expect(csv).not.toContain("ByAnna");
    expect(csv).not.toContain("anna.friend@x.io");
    expect((await contactDuplicateGroups(owner, ws.id)).flat().map((c) => c.name)).not.toContain("ByAnna");
    await expect(mergeContacts(owner, ws.id, { primaryId: ids.byOwner, duplicateIds: [ids.byAnna] })).rejects.toMatchObject({ status: 404 });
    expect(await raw.contact.count({ where: { nodeId: ids.byAnna } })).toBe(1);
  });

  it("the data of a person is exported and erased only by whoever can see that person", async () => {
    await expect(gdprExport(owner, ids.byAnna)).rejects.toMatchObject({ status: 404 });
    await expect(gdprErase(owner, ids.byAnna)).rejects.toMatchObject({ status: 404 });
    await expect(gdprErase(admin, ids.byAnna)).rejects.toMatchObject({ status: 404 });
    expect(await raw.contact.count({ where: { nodeId: ids.byAnna } })).toBe(1);
    expect((await gdprExport(anna, ids.byAnna)).contact.firstName).toBe("ByAnna");
  });

  it("the keeper of a person can export and erase their data on request, even at the 'own' level that has no export of its own", async () => {
    const mine = await make(anna, "ToErase");
    expect((await gdprExport(anna, mine)).contact.firstName).toBe("ToErase");
    await expect(gdprErase(owner, mine)).rejects.toMatchObject({ status: 404 }); // the leader does not see this person, so cannot erase them either
    await gdprErase(anna, mine);
    expect(await raw.contact.count({ where: { nodeId: mine } })).toBe(0);
  });

  it("a company page and its map list only the people of it one may see", async () => {
    const page = await getCompany(owner, company);
    expect(page.contacts.map((c) => c.name)).toEqual(["ByOwner"]);
    const map = await getClientMap(owner, company);
    expect(JSON.stringify(map)).not.toContain("ByAnna");
  });

  it("the numbers stay: the people above still see what their partners do, without names", async () => {
    const act = await getTeamActivity(boris, ws.id, { days: 7 } as never);
    expect(JSON.stringify(act)).not.toContain("ByEve");
    expect(act).toBeTruthy();
  });
});

describe("sharing is the only way in", () => {
  it("an owner can be given one person by their keeper, to look at but not to change, and it can be taken back", async () => {
    await expect(getContact(owner, ids.byAnna)).rejects.toMatchObject({ status: 404 });
    const shares = await listContactShares(anna, ids.byAnna);
    expect(shares.candidates.users.map((u) => u.id)).toEqual(expect.arrayContaining([owner, admin, cora])); // in a private workspace even they need a share
    const { id } = await grantContactShare(anna, ids.byAnna, { userId: owner, level: "VIEW" });
    expect((await getContact(owner, ids.byAnna)).firstName).toBe("ByAnna");
    await expect(updateContact(owner, ids.byAnna, { firstName: "Changed" })).rejects.toMatchObject({ status: 403 });
    expect((await names(owner))).toContain("ByAnna");
    // what was shared is not theirs to pass on
    await expect(grantContactShare(owner, ids.byAnna, { userId: admin, level: "VIEW" })).rejects.toMatchObject({ status: 403 });
    await expect(getContact(admin, ids.byAnna)).rejects.toMatchObject({ status: 404 });
    await revokeShare(anna, id);
    await expect(getContact(owner, ids.byAnna)).rejects.toMatchObject({ status: 404 });
  });

  it("a group is shared only when all its people are the sharer's own", async () => {
    const group = await createGroup(owner, ws.id, { name: "Mixed" } as never);
    await raw.contact.updateMany({ where: { nodeId: { in: [ids.byOwner, ids.byAnna] } }, data: { groupId: group.id } });
    await expect(grantGroupShare(owner, group.id, { userId: boris, level: "VIEW" })).rejects.toMatchObject({ status: 403 });
    await raw.contact.update({ where: { nodeId: ids.byAnna }, data: { groupId: null } });
    expect(await grantGroupShare(owner, group.id, { userId: boris, level: "VIEW" })).toHaveProperty("id");
    expect(await names(boris)).toContain("ByOwner");
    await raw.contactShare.deleteMany({ where: { workspaceId: ws.id } });
  });
});

describe("the open mode", () => {
  it("only the owner of the workspace can change it, and the change is written down", async () => {
    await expect(setContactPrivacy(admin, ws.id, "OPEN")).rejects.toMatchObject({ status: 403 });
    await expect(setContactPrivacy(anna, ws.id, "OPEN")).rejects.toMatchObject({ status: 403 });
    expect(await setContactPrivacy(owner, ws.id, "OPEN")).toEqual({ mode: "OPEN", canChange: true });
    expect(await raw.activityLog.count({ where: { workspaceId: ws.id, action: "workspace.contact_privacy" } })).toBe(1);
  });

  it("open, the level says who sees whom, as before", async () => {
    const all = ["ByAnna", "ByBoris", "ByEve", "ByOwner", "PBoris", "PEve"];
    expect(await names(owner)).toEqual(all);
    expect(await names(admin)).toEqual(all);
    expect(await names(cora)).toEqual(all);
    expect(await names(boris)).toEqual(["ByBoris", "ByEve", "PBoris", "PEve"]);
    expect(await names(anna)).toEqual(["ByAnna"]);
    expect((await getContact(owner, ids.byAnna)).firstName).toBe("ByAnna");
  });

  it("and going back to private hides them again at once", async () => {
    await setContactPrivacy(owner, ws.id, "PRIVATE");
    expect(await names(owner)).toEqual(["ByOwner", "PBoris", "PEve"]);
    await expect(getContact(owner, ids.byAnna)).rejects.toMatchObject({ status: 404 });
  });
});
