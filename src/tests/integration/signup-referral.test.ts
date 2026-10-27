import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient, sent: [] as { to: string; subject: string }[] }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn(async (m: { to: string; subject: string }) => void holder.sent.push(m)) }));

import { createWorkspace } from "@/server/services/workspace";
import { ensureMyPartnerCard } from "@/server/services/crm/people";
import { listPeople } from "@/server/services/crm/people";
import { getContact } from "@/server/services/crm/contacts";
import { applySignupIntent, assertCanCreateWorkspace, getOrCreateReferralLink, intentLocale, joinByReferral, referralInfo, saveSignupIntent, sendWelcome } from "@/server/services/signup";

let close: () => Promise<void>;
let raw: PrismaClient;
let sponsor: string;
let plain: string;
let ws: { id: string; slug: string; name: string };

const newUser = async (email: string) => raw.user.create({ data: { email } });

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  sponsor = (await t.db.user.create({ data: { email: "sponsor@x.io", name: "Sam Sponsor" } })).id;
  plain = (await t.db.user.create({ data: { email: "plain@x.io" } })).id;
  ws = await createWorkspace(sponsor, "Sam's team");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  await t.db.membership.create({ data: { userId: plain, workspaceId: ws.id, role: "MEMBER", crmAccess: false } });
}, 120_000);
afterAll(async () => close?.());

describe("what is typed when creating an account", () => {
  it("is kept until the account exists, and then given to it", async () => {
    await saveSignupIntent({ email: "  Newbie@X.io ", firstName: " Nora ", lastName: "Nowak", locale: "ru" });
    expect(await intentLocale("newbie@x.io")).toBe("ru");
    const u = await newUser("newbie@x.io");
    await applySignupIntent({ id: u.id, email: "newbie@x.io" });
    expect(await raw.user.findUniqueOrThrow({ where: { id: u.id } })).toMatchObject({ firstName: "Nora", lastName: "Nowak", name: "Nora Nowak", locale: "ru" });
    expect(await raw.signupIntent.count({ where: { email: "newbie@x.io" } })).toBe(0);
  });
  it("an address nobody asked about is in English and a bad language is ignored", async () => {
    expect(await intentLocale("nobody@x.io")).toBe("en");
    await saveSignupIntent({ email: "klingon@x.io", firstName: "K", locale: "tlh" });
    expect(await intentLocale("klingon@x.io")).toBe("en");
  });
  it("an old intent is not used", async () => {
    const old = new Date(Date.now() - 3 * 86_400_000);
    await raw.signupIntent.create({ data: { email: "late@x.io", firstName: "Late", createdAt: old } });
    const u = await newUser("late@x.io");
    await applySignupIntent({ id: u.id, email: "late@x.io" });
    expect((await raw.user.findUniqueOrThrow({ where: { id: u.id } })).firstName).toBeNull();
  });
  it("saving again replaces what was typed before", async () => {
    await saveSignupIntent({ email: "twice@x.io", firstName: "One" });
    await saveSignupIntent({ email: "twice@x.io", firstName: "Two", lastName: "Name" });
    expect(await raw.signupIntent.findUniqueOrThrow({ where: { email: "twice@x.io" } })).toMatchObject({ firstName: "Two", lastName: "Name" });
  });
});

describe("the invitation link", () => {
  let code = "";
  it("is made once for the sponsor and workspace, and says who invited", async () => {
    const a = await getOrCreateReferralLink(sponsor, ws.id);
    const b = await getOrCreateReferralLink(sponsor, ws.id);
    code = a.code;
    expect(b.code).toBe(a.code);
    expect(a.code).toMatch(/^[a-z0-9]{10}$/);
    expect(a.url.endsWith(`/r/${a.code}`)).toBe(true);
    expect(a.joined).toBe(0);
    expect(await referralInfo(code)).toEqual({ inviter: "Sam Sponsor" });
    expect(await referralInfo("nonexistent1")).toBeNull();
    expect(await referralInfo("BAD")).toBeNull();
  });
  it("is only for members who can write in the CRM", async () => {
    await expect(getOrCreateReferralLink(plain, ws.id)).rejects.toMatchObject({ status: 403 });
  });

  it("puts a new person in the sponsor's people as a new lead they own, under their partner card, and tells them", async () => {
    const card = (await ensureMyPartnerCard(sponsor, ws.id)).id;
    await saveSignupIntent({ email: "guest1@x.io", firstName: "Gus", lastName: "Guest", refCode: code });
    const u = await newUser("guest1@x.io");
    await applySignupIntent({ id: u.id, email: "guest1@x.io" });
    const people = await listPeople(sponsor, ws.id, { due: "0" });
    const gus = people.items.find((p) => p.name === "Gus Guest");
    expect(gus).toMatchObject({ stage: "NEW", source: "Referral link", ownerId: sponsor, email: "guest1@x.io" });
    const c = await getContact(sponsor, gus!.id);
    expect(c.sponsorId).toBe(card);
    expect(await raw.referralJoin.count({ where: { userId: u.id } })).toBe(1);
    expect((await getOrCreateReferralLink(sponsor, ws.id)).joined).toBe(1);
    const n = await raw.notification.findFirst({ where: { userId: sponsor, kind: "lead" } });
    expect(n).not.toBeNull();
    expect(await raw.crmActivity.count({ where: { contactId: gus!.id, type: "NOTE" } })).toBeGreaterThanOrEqual(1);
  });
  it("someone who is already a contact by e-mail is not made twice", async () => {
    const before = (await listPeople(sponsor, ws.id, { due: "0" })).items.length;
    await raw.contact.updateMany({ where: { emails: { has: "guest1@x.io" } }, data: {} });
    const u = await newUser("guest1b@x.io");
    await raw.contact.updateMany({ where: { firstName: "Gus" }, data: { emails: ["guest1@x.io", "guest1b@x.io"] } });
    await joinByReferral({ id: u.id, email: "guest1b@x.io", firstName: "Gus" }, code);
    expect((await listPeople(sponsor, ws.id, { due: "0" })).items.length).toBe(before);
    expect(await raw.referralJoin.count({ where: { userId: u.id } })).toBe(1);
  });
  it("the same person joining twice is recorded once, and a person cannot invite themselves", async () => {
    const u = await newUser("guest2@x.io");
    expect(await joinByReferral({ id: u.id, email: "guest2@x.io", firstName: "Two" }, code)).not.toBeNull();
    expect(await joinByReferral({ id: u.id, email: "guest2@x.io", firstName: "Two" }, code)).toBeNull();
    expect(await joinByReferral({ id: sponsor, email: "sponsor@x.io" }, code)).toBeNull();
    expect(await raw.referralJoin.count({ where: { userId: u.id } })).toBe(1);
  });
  it("a code that does not exist, or a sponsor who lost the CRM, adds nobody", async () => {
    const u = await newUser("guest3@x.io");
    expect(await joinByReferral({ id: u.id, email: "guest3@x.io" }, "doesnotexist")).toBeNull();
    await raw.membership.update({ where: { userId_workspaceId: { userId: sponsor, workspaceId: ws.id } }, data: { role: "GUEST" } });
    expect(await joinByReferral({ id: u.id, email: "guest3@x.io" }, code)).toBeNull();
    await raw.membership.update({ where: { userId_workspaceId: { userId: sponsor, workspaceId: ws.id } }, data: { role: "OWNER" } });
    expect(await raw.referralJoin.count({ where: { userId: u.id } })).toBe(0);
  });
});

describe("the first workspace", () => {
  it("a new person may make one; a second needs a paid plan or a grant", async () => {
    const u = await newUser("owner1@x.io");
    await expect(assertCanCreateWorkspace(u.id)).resolves.toBeUndefined();
    await createWorkspace(u.id, "First");
    await expect(assertCanCreateWorkspace(u.id)).rejects.toMatchObject({ status: 402, code: "workspace_limit" });
    await raw.workspace.updateMany({ where: { memberships: { some: { userId: u.id } } }, data: { plan: "PRO" } });
    await expect(assertCanCreateWorkspace(u.id)).resolves.toBeUndefined();
  });
  it("a member of someone else's workspace may still make their own", async () => {
    await expect(assertCanCreateWorkspace(plain)).resolves.toBeUndefined();
  });
  it("the welcome e-mail goes out in the person's language, and a failure never breaks the request", async () => {
    holder.sent.length = 0;
    await sendWelcome(sponsor, { name: "Sam's team", slug: ws.slug });
    expect(holder.sent).toHaveLength(1);
    expect(holder.sent[0]?.to).toBe("sponsor@x.io");
    await raw.user.update({ where: { id: sponsor }, data: { locale: "pl" } });
    await sendWelcome(sponsor, { name: "Sam's team", slug: ws.slug });
    expect(holder.sent[1]?.subject).toBe("Witaj w MeetOwl");
    await expect(sendWelcome("nobody", { name: "x", slug: "x" })).resolves.toBeUndefined();
  });
});
