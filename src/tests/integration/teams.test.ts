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
import { createContact, getContact } from "@/server/services/crm/contacts";
import { listPeople } from "@/server/services/crm/people";
import { listCompanies } from "@/server/services/crm/companies";
import { removeMember } from "@/server/services/membership";
import { createTeam, deleteTeam, listTeams, updateTeam } from "@/server/services/teams";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let anna: string;
let boris: string;
let cora: string; // has no CRM access of her own
let guest: string;
let ws: { id: string };

const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };
const make = async (by: string, firstName: string) => (await createContact(by, ws.id, { ...base, firstName })).id;
const names = async (u: string) => (await listPeople(u, ws.id, { due: "0" })).items.map((i) => i.name).sort();
const scopeOf = async (u: string) => (await raw.membership.findUniqueOrThrow({ where: { userId_workspaceId: { userId: u, workspaceId: ws.id } } })).teamScope;
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
  cora = await user("cora");
  guest = await user("guest");
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO", contactPrivacy: "OPEN" } });
  const member = (userId: string, role: "MEMBER" | "GUEST", crmAccess: boolean, crmScope: "OWN" | "ALL") => t.db.membership.create({ data: { userId, workspaceId: ws.id, role, crmAccess, crmScope } });
  await member(anna, "MEMBER", true, "OWN");
  await member(boris, "MEMBER", true, "OWN");
  await member(cora, "MEMBER", false, "ALL");
  await member(guest, "GUEST", false, "ALL");
  await make(owner, "ByOwner");
  await make(anna, "ByAnna");
  await make(boris, "ByBoris");
  await createContact(owner, ws.id, { ...base, firstName: "ByCora", ownerId: cora });
}, 120_000);
afterAll(async () => close?.());

describe("teams", () => {
  let team = "";

  it("only owners and admins make teams; guests and clients cannot be in them", async () => {
    await expect(createTeam(anna, ws.id, { name: "X", memberIds: [] })).rejects.toMatchObject({ status: 403 });
    await expect(createTeam(owner, ws.id, { name: "X", memberIds: [guest] })).rejects.toMatchObject({ code: "invalid_team_member" });
    await expect(createTeam(owner, ws.id, { name: "X", memberIds: ["nobody"] })).rejects.toMatchObject({ code: "invalid_team_member" });
  });

  it("a team with a leader, shared people: the members see each other's people, others do not", async () => {
    expect(await names(anna)).toEqual(["ByAnna"]);
    team = (await createTeam(owner, ws.id, { name: "Warsaw", leaderId: anna, crmScope: "TEAM", memberIds: [boris] })).id;
    expect(await scopeOf(anna)).toBe("TEAM");
    expect(await scopeOf(boris)).toBe("TEAM");
    expect(await scopeOf(cora)).toBeNull();
    expect(await names(anna)).toEqual(["ByAnna", "ByBoris"]);
    expect(await names(boris)).toEqual(["ByAnna", "ByBoris"]);
    expect((await getContact(boris, (await raw.contact.findFirstOrThrow({ where: { firstName: "ByAnna" } })).nodeId)).firstName).toBe("ByAnna");
    await expect(listPeople(cora, ws.id, { due: "0" })).rejects.toMatchObject({ status: 403 });
    const t = (await listTeams(owner, ws.id))[0];
    expect(t).toMatchObject({ name: "Warsaw", leaderId: anna, crmScope: "TEAM" });
    expect(t?.memberIds.sort()).toEqual([anna, boris].sort());
    await expect(createTeam(owner, ws.id, { name: "Warsaw", memberIds: [] })).rejects.toMatchObject({ code: "team_exists" });
  });

  it("adding a member without CRM access opens the CRM to them, as far as the team goes", async () => {
    await updateTeam(owner, team, { memberIds: [anna, boris, cora] });
    expect(await scopeOf(cora)).toBe("TEAM");
    expect(await names(cora)).toEqual(["ByAnna", "ByBoris", "ByCora"]);
    await expect(listCompanies(cora, ws.id, page)).rejects.toMatchObject({ status: 403 });
  });

  it("a team that gives everything shows everything and shuts the doors when it is loosened or deleted", async () => {
    await updateTeam(owner, team, { crmScope: "ALL" });
    expect(await names(cora)).toEqual(["ByAnna", "ByBoris", "ByCora", "ByOwner"]);
    expect((await listCompanies(cora, ws.id, page)).total).toBe(0);
    await updateTeam(owner, team, { crmScope: null });
    expect(await scopeOf(cora)).toBeNull();
    await expect(listPeople(cora, ws.id, { due: "0" })).rejects.toMatchObject({ status: 403 });
    expect(await names(anna)).toEqual(["ByAnna"]);
    await updateTeam(owner, team, { crmScope: "TEAM" });
    expect(await scopeOf(boris)).toBe("TEAM");
    await deleteTeam(owner, team);
    expect(await scopeOf(boris)).toBeNull();
    expect(await names(boris)).toEqual(["ByBoris"]);
    expect(await listTeams(owner, ws.id)).toEqual([]);
  });

  it("the best of several teams counts, and taking someone out of a team takes the grant away", async () => {
    const a = (await createTeam(owner, ws.id, { name: "A", crmScope: "TEAM", memberIds: [anna, boris] })).id;
    const b = (await createTeam(owner, ws.id, { name: "B", crmScope: "ALL", memberIds: [anna] })).id;
    expect(await scopeOf(anna)).toBe("ALL");
    expect(await scopeOf(boris)).toBe("TEAM");
    await updateTeam(owner, b, { memberIds: [] });
    expect(await scopeOf(anna)).toBe("TEAM");
    await updateTeam(owner, a, { memberIds: [boris] });
    expect(await scopeOf(anna)).toBeNull();
  });

  it("removing a member from the workspace takes them out of their teams and clears a leader's seat", async () => {
    const t = (await createTeam(owner, ws.id, { name: "C", leaderId: boris, crmScope: "TEAM", memberIds: [] })).id;
    await removeMember({ userId: owner, role: "OWNER" }, ws.id, boris);
    expect(await raw.teamMember.count({ where: { userId: boris } })).toBe(0);
    expect((await raw.team.findUniqueOrThrow({ where: { id: t } })).leaderId).toBeNull();
    const log = await raw.activityLog.findMany({ where: { workspaceId: ws.id, action: { startsWith: "team." } } });
    expect(log.length).toBeGreaterThanOrEqual(6);
  });
});
