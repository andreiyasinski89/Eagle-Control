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
import { createContact, getContact, updateContact } from "@/server/services/crm/contacts";
import { listPeople } from "@/server/services/crm/people";
import { createGroup, deleteGroup } from "@/server/services/crm/groups";
import { grantContactShare, grantGroupShare, listContactShares, listGroupShares, revokeShare } from "@/server/services/crm/shares";
import { createTeam } from "@/server/services/teams";
import { updateMember } from "@/server/services/membership";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let anna: string; // sees her own people
let boris: string; // sees his own people, in a team
let cora: string; // no CRM access
let dave: string; // sees everything
let ws: { id: string };
const ids = {} as Record<"byOwner" | "byAnna" | "byBoris" | "inGroup" | "inSub" | "outside" | "group" | "sub" | "team", string>;

const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };
const make = async (by: string, firstName: string, extra: Record<string, unknown> = {}) => (await createContact(by, ws.id, { ...base, firstName, ...extra })).id;
const names = async (u: string) => (await listPeople(u, ws.id, { due: "0" })).items.map((i) => i.name).sort();
const admin = { userId: "", role: "OWNER" as const };

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  const user = async (n: string) => (await t.db.user.create({ data: { email: `${n}@x.io`, name: n } })).id;
  owner = await user("owner");
  anna = await user("anna");
  boris = await user("boris");
  cora = await user("cora");
  dave = await user("dave");
  admin.userId = owner;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO", contactPrivacy: "OPEN" } });
  const member = (userId: string, crmAccess: boolean, crmScope: "OWN" | "ALL") => t.db.membership.create({ data: { userId, workspaceId: ws.id, role: "MEMBER", crmAccess, crmScope } });
  await member(anna, true, "OWN");
  await member(boris, true, "OWN");
  await member(cora, false, "ALL");
  await member(dave, true, "ALL");
  ids.group = (await createGroup(owner, ws.id, { name: "Cold market" })).id;
  ids.sub = (await createGroup(owner, ws.id, { name: "Gym", parentId: ids.group })).id;
  ids.team = (await createTeam(owner, ws.id, { name: "Crew", memberIds: [boris] })).id;
  ids.byOwner = await make(owner, "ByOwner");
  ids.byAnna = await make(anna, "ByAnna");
  ids.byBoris = await make(boris, "ByBoris");
  ids.inGroup = await make(owner, "InGroup", { groupId: ids.group });
  ids.inSub = await make(owner, "InSub", { groupId: ids.sub });
  ids.outside = await make(owner, "Outside");
}, 120_000);
afterAll(async () => close?.());

describe("access to one person", () => {
  it("a view share shows the card but does not let the member change it", async () => {
    expect(await names(anna)).toEqual(["ByAnna"]);
    await grantContactShare(owner, ids.byOwner, { userId: anna, level: "VIEW" });
    expect(await names(anna)).toEqual(["ByAnna", "ByOwner"]);
    const card = await getContact(anna, ids.byOwner);
    expect(card.access).toEqual({ canEdit: false, canShare: false });
    await expect(updateContact(anna, ids.byOwner, { firstName: "Changed" })).rejects.toMatchObject({ status: 403 });
    expect(await names(boris)).toEqual(["ByBoris"]);
  });

  it("an edit share lets them change it; granting again changes the level instead of doubling the share", async () => {
    await grantContactShare(owner, ids.byOwner, { userId: anna, level: "EDIT" });
    expect(await raw.contactShare.count({ where: { contactId: ids.byOwner } })).toBe(1);
    expect((await getContact(anna, ids.byOwner)).access.canEdit).toBe(true);
    await updateContact(anna, ids.byOwner, { position: "Boss" });
    expect((await getContact(owner, ids.byOwner)).position).toBe("Boss");
  });

  it("taking the access away hides the person again", async () => {
    const { items } = await listContactShares(owner, ids.byOwner);
    expect(items).toMatchObject([{ kind: "user", name: "anna", level: "EDIT" }]);
    await revokeShare(owner, items[0]!.id);
    expect(await names(anna)).toEqual(["ByAnna"]);
    await expect(getContact(anna, ids.byOwner)).rejects.toMatchObject({ status: 404 });
  });

  it("a team can be given access, and each member of it gets it", async () => {
    await grantContactShare(owner, ids.outside, { teamId: ids.team, level: "EDIT" });
    expect(await names(boris)).toEqual(["ByBoris", "Outside"]);
    await updateContact(boris, ids.outside, { position: "Lead" });
    expect(await names(anna)).toEqual(["ByAnna"]);
  });
});

describe("access to a group", () => {
  it("a share on a group shows its people and those of its subgroups, and nothing else", async () => {
    await grantGroupShare(owner, ids.group, { userId: anna, level: "VIEW" });
    expect(await names(anna)).toEqual(["ByAnna", "InGroup", "InSub"]);
    await expect(updateContact(anna, ids.inSub, { firstName: "x" })).rejects.toMatchObject({ status: 403 });
    const { items } = await listGroupShares(owner, ids.group);
    expect(items).toHaveLength(1);
  });
  it("deleting the group removes its shares", async () => {
    await deleteGroup(owner, ids.group);
    expect(await raw.contactShare.count({ where: { groupId: ids.group } })).toBe(0);
    expect(await names(anna)).toEqual(["ByAnna"]);
  });
});

describe("who may give access, and to whom", () => {
  it("the owner of a person may share them; a member who was only shown the person may not", async () => {
    await grantContactShare(anna, ids.byAnna, { userId: boris, level: "VIEW" });
    expect(await names(boris)).toContain("ByAnna");
    await grantContactShare(owner, ids.byOwner, { userId: anna, level: "VIEW" });
    await expect(grantContactShare(anna, ids.byOwner, { userId: boris, level: "VIEW" })).rejects.toMatchObject({ status: 403 });
    await expect(listContactShares(anna, ids.byOwner)).rejects.toMatchObject({ status: 403 });
    await expect(listContactShares(boris, ids.byAnna)).rejects.toMatchObject({ status: 403 });
    const mine = await raw.contactShare.findFirstOrThrow({ where: { contactId: ids.byOwner, userId: anna } });
    await expect(revokeShare(anna, mine.id)).rejects.toMatchObject({ status: 403 });
    await revokeShare(owner, mine.id);
  });
  it("nobody reaches another person's card by trying to share it", async () => {
    await expect(grantContactShare(anna, ids.byBoris, { userId: boris, level: "VIEW" })).rejects.toMatchObject({ status: 404 });
  });
  it("groups are shared by those who see the whole CRM only", async () => {
    const g = (await createGroup(owner, ws.id, { name: "Warm" })).id;
    await expect(grantGroupShare(anna, g, { userId: boris, level: "VIEW" })).rejects.toMatchObject({ status: 403 });
    await expect(listGroupShares(anna, g)).rejects.toMatchObject({ status: 403 });
  });
  it("the receiver must be a member who sees part of the CRM", async () => {
    await expect(grantContactShare(owner, ids.byOwner, { userId: cora, level: "VIEW" })).rejects.toMatchObject({ code: "grantee_no_crm" });
    await expect(grantContactShare(owner, ids.byOwner, { userId: dave, level: "VIEW" })).rejects.toMatchObject({ code: "already_sees_all" });
    await expect(grantContactShare(owner, ids.byOwner, { userId: owner, level: "VIEW" })).rejects.toMatchObject({ code: "self_share" });
    await expect(grantContactShare(owner, ids.byOwner, { userId: "nobody", level: "VIEW" })).rejects.toMatchObject({ code: "invalid_grantee" });
    await expect(grantContactShare(owner, ids.byOwner, { teamId: "nowhere", level: "VIEW" })).rejects.toMatchObject({ code: "invalid_grantee" });
  });
  it("the list offers only members who can be given access, and the history keeps every grant and revoke", async () => {
    const { candidates } = await listContactShares(owner, ids.byOwner);
    expect(candidates.users.map((u) => u.name).sort()).toEqual(["anna", "boris"]);
    expect(candidates.teams.map((t) => t.name)).toEqual(["Crew"]);
    const log = await raw.activityLog.findMany({ where: { workspaceId: ws.id, action: { in: ["contact.shared", "contact.unshared", "contact_group.shared"] } } });
    expect(log.length).toBeGreaterThanOrEqual(6);
  });
  it("a share does nothing once the member's CRM access is taken away", async () => {
    await updateMember(admin, ws.id, boris, { crmLevel: "NONE" });
    await expect(listPeople(boris, ws.id, { due: "0" })).rejects.toMatchObject({ status: 403 });
    await expect(getContact(boris, ids.outside)).rejects.toMatchObject({ status: 404 });
  });
});
