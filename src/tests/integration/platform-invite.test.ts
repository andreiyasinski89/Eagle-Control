import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

vi.hoisted(() => {
  Object.assign(process.env, { DATABASE_URL: "postgresql://x", AUTH_SECRET: "x", SUPERADMIN_EMAILS: " Boss@Example.com " });
});
const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { createContact } from "@/server/services/crm/contacts";
import { adjustBonus, getUserDetail, isSuperAdminEmail, listUsers, requireSuperAdmin, setMemberRole, setSuspended, setWorkspacePlan } from "@/server/services/admin";
import { applySignupIntent, getInvites, inviteInfo, joinByInvite, saveSignupIntent } from "@/server/services/signup";

let close: () => Promise<void>;
let raw: PrismaClient;
let boss: string;
let anna: string;
let ws: { id: string };
let annaCode = "";

const user = (email: string, name?: string) => raw.user.create({ data: { email, name } });
const people = { listUsers: (q?: string) => listUsers(boss, { page: 1, pageSize: 25, q }) };

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  boss = (await user("boss@example.com", "The Boss")).id;
  anna = (await user("anna@x.io", "Anna Ng")).id;
  ws = await createWorkspace(anna, "Anna's team");
}, 120_000);
afterAll(async () => close?.());

describe("the platform invitation link", () => {
  it("is made once for a person, and says who invited", async () => {
    const a = await getInvites(anna);
    const b = await getInvites(anna);
    annaCode = a.code;
    expect(b.code).toBe(a.code);
    expect(a.url.endsWith(`/i/${a.code}`)).toBe(true);
    expect(a).toMatchObject({ points: 0, invited: [] });
    expect(await inviteInfo(annaCode)).toEqual({ inviter: "Anna Ng" });
    expect(await inviteInfo("nonexistent1")).toBeNull();
  });

  it("someone who joins through it is marked as invited, and the inviter gets one point and a notification", async () => {
    await saveSignupIntent({ email: "bob@x.io", firstName: "Bob", lastName: "Stone", inviteCode: annaCode });
    const bob = await user("bob@x.io");
    await applySignupIntent({ id: bob.id, email: "bob@x.io" });
    expect(await raw.user.findUniqueOrThrow({ where: { id: bob.id } })).toMatchObject({ referredById: anna, name: "Bob Stone" });
    const inv = await getInvites(anna);
    expect(inv.points).toBe(1);
    expect(inv.invited).toHaveLength(1);
    expect(inv.invited[0]).toMatchObject({ name: "Bob Stone", steps: { workspace: false, people: false } });
    expect(await raw.notification.count({ where: { userId: anna, kind: "invite_joined" } })).toBe(1);
  });

  it("shows how far they have got in steps, never what is in their workspace or their e-mail", async () => {
    const bob = await raw.user.findUniqueOrThrow({ where: { email: "bob@x.io" } });
    const bobWs = await createWorkspace(bob.id, "Bob's");
    let inv = await getInvites(anna);
    expect(inv.invited[0]?.steps).toEqual({ workspace: true, people: false });
    await createContact(bob.id, bobWs.id, { firstName: "Client", emails: [], phones: [], messengers: {}, allowDuplicate: false, consentGiven: false });
    inv = await getInvites(anna);
    expect(inv.invited[0]?.steps).toEqual({ workspace: true, people: true });
    expect(JSON.stringify(inv)).not.toContain("bob@x.io");
    expect(JSON.stringify(inv)).not.toContain("Client");
  });

  it("nobody is added to the inviter's CRM or workspace by it", async () => {
    expect(await raw.membership.count({ where: { workspaceId: ws.id } })).toBe(1);
    expect(await raw.contact.count({ where: { workspaceId: ws.id } })).toBe(0);
  });

  it("a person cannot invite themselves, be invited twice, or be invited by a blocked or missing person", async () => {
    const carl = await user("carl@x.io");
    expect(await joinByInvite({ id: anna, email: "anna@x.io" }, annaCode)).toBeNull();
    expect(await joinByInvite({ id: carl.id, email: "carl@x.io" }, "doesnotexist")).toBeNull();
    expect(await joinByInvite({ id: carl.id, email: "carl@x.io" }, annaCode)).toEqual({ inviterId: anna });
    expect(await joinByInvite({ id: carl.id, email: "carl@x.io" }, annaCode)).toBeNull();
    const dan = await user("dan@x.io");
    await raw.user.update({ where: { id: anna }, data: { suspendedAt: new Date() } });
    expect(await joinByInvite({ id: dan.id, email: "dan@x.io" }, annaCode)).toBeNull();
    expect(await inviteInfo(annaCode)).toBeNull();
    await raw.user.update({ where: { id: anna }, data: { suspendedAt: null } });
    expect((await getInvites(anna)).points).toBe(2);
  });
});

describe("the platform owner", () => {
  it("is known by the addresses in SUPERADMIN_EMAILS, in any case; everyone else gets a 404", async () => {
    expect(isSuperAdminEmail("BOSS@example.com")).toBe(true);
    expect(isSuperAdminEmail("anna@x.io")).toBe(false);
    expect(isSuperAdminEmail(null)).toBe(false);
    await expect(requireSuperAdmin(anna)).rejects.toMatchObject({ status: 404 });
    await expect(listUsers(anna, { page: 1, pageSize: 25 })).rejects.toMatchObject({ status: 404 });
    await expect(getUserDetail(anna, boss)).rejects.toMatchObject({ status: 404 });
    await expect(setSuspended(anna, boss, true)).rejects.toMatchObject({ status: 404 });
    await expect(adjustBonus(anna, anna, { points: 5 })).rejects.toMatchObject({ status: 404 });
    await expect(setWorkspacePlan(anna, ws.id, "PRO")).rejects.toMatchObject({ status: 404 });
  });

  it("sees everyone: how they came, what they own, their points", async () => {
    const all = await people.listUsers();
    expect(all.total).toBe(5);
    const a = all.items.find((u) => u.id === anna)!;
    expect(a).toMatchObject({ invitedCount: 2, points: 2, workspaces: [{ name: "Anna's team", plan: "FREE" }] });
    const b = all.items.find((u) => u.email === "bob@x.io")!;
    expect(b.invitedBy).toBe("Anna Ng");
    expect((await people.listUsers("bob")).items.map((u) => u.email)).toEqual(["bob@x.io"]);
    expect(all.items.find((u) => u.id === boss)?.isSuperAdmin).toBe(true);
  });

  it("opens one account in full: registration data, access in each workspace, whom they invited", async () => {
    const d = await getUserDetail(boss, anna);
    expect(d).toMatchObject({ email: "anna@x.io", points: 2, invitedBy: null });
    expect(d.invited).toHaveLength(2);
    expect(d.workspaces).toMatchObject([{ name: "Anna's team", role: "OWNER", crm: "ALL", members: 1, contacts: 0 }]);
    const bob = await raw.user.findUniqueOrThrow({ where: { email: "bob@x.io" } });
    expect((await getUserDetail(boss, bob.id)).workspaces[0]).toMatchObject({ role: "OWNER", contacts: 1 });
  });

  it("blocks an account (and ends its sessions), lets it back, and cannot block itself or the owner", async () => {
    await raw.session.create({ data: { sessionToken: "t1", userId: anna, expires: new Date(Date.now() + 1e6) } });
    await setSuspended(boss, anna, true);
    expect((await raw.user.findUniqueOrThrow({ where: { id: anna } })).suspendedAt).not.toBeNull();
    expect(await raw.session.count({ where: { userId: anna } })).toBe(0);
    expect((await people.listUsers()).items.find((u) => u.id === anna)?.suspended).toBe(true);
    await setSuspended(boss, anna, false);
    expect((await raw.user.findUniqueOrThrow({ where: { id: anna } })).suspendedAt).toBeNull();
    await expect(setSuspended(boss, boss, true)).rejects.toMatchObject({ status: 403 });
    await expect(setSuspended(boss, "nobody", true)).rejects.toMatchObject({ status: 404 });
  });

  it("sets a workspace's plan and changes points by hand, and keeps a record of what was done", async () => {
    await setWorkspacePlan(boss, ws.id, "PRO");
    expect((await raw.workspace.findUniqueOrThrow({ where: { id: ws.id } })).plan).toBe("PRO");
    expect(await adjustBonus(boss, anna, { points: 5, note: "Contest prize" })).toEqual({ points: 7 });
    expect(await adjustBonus(boss, anna, { points: -2 })).toEqual({ points: 5 });
    const d = await getUserDetail(boss, anna);
    expect(d.points).toBe(5);
    expect(d.pointsLog.some((p) => p.note === "Contest prize")).toBe(true);
    expect(d.actions.map((a) => a.action)).toEqual(expect.arrayContaining(["bonus.adjusted", "user.restored", "user.suspended"]));
    expect(await raw.adminLog.count({ where: { action: "workspace.plan" } })).toBe(1);
  });

  it("changes a person's role and CRM access in a workspace by hand, never an owner's, and writes it in the log", async () => {
    const ben = (await user("ben@x.io", "Ben")).id;
    await raw.membership.create({ data: { userId: ben, workspaceId: ws.id, role: "CLIENT", crmAccess: false } });
    await expect(setMemberRole(anna, ws.id, ben, { role: "MEMBER" })).rejects.toMatchObject({ status: 404 }); // for anyone but the platform owner it does not exist
    expect(await setMemberRole(boss, ws.id, ben, { role: "MEMBER", crmLevel: "OWN" })).toEqual({ role: "MEMBER" });
    expect(await raw.membership.findUniqueOrThrow({ where: { userId_workspaceId: { userId: ben, workspaceId: ws.id } } })).toMatchObject({ role: "MEMBER", crmAccess: true, crmScope: "OWN" });
    // only the CRM level: the role stays
    await setMemberRole(boss, ws.id, ben, { crmLevel: "NONE" });
    expect(await raw.membership.findUniqueOrThrow({ where: { userId_workspaceId: { userId: ben, workspaceId: ws.id } } })).toMatchObject({ role: "MEMBER", crmAccess: false });
    // a workspace's owner keeps the role: it must always have one
    await expect(setMemberRole(boss, ws.id, anna, { role: "GUEST" })).rejects.toMatchObject({ status: 403 });
    await expect(setMemberRole(boss, ws.id, "nobody", { role: "GUEST" })).rejects.toMatchObject({ status: 404 });
    const log = await raw.adminLog.findMany({ where: { action: "member.role" } });
    expect(log).toHaveLength(2);
    expect(log[0]?.data).toMatchObject({ from: { role: "CLIENT" }, to: { role: "MEMBER" } });
  });
});
