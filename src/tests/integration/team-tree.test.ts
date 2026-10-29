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
vi.hoisted(() => {
  process.env.APP_URL = "https://meetowl.test";
});

import { createWorkspace } from "@/server/services/workspace";
import { createContact } from "@/server/services/crm/contacts";
import { getTeamHeat, getTeamTree, setTeamHeat } from "@/server/services/crm/team-tree";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let member: string;
let ws: { id: string };
const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };
const NOW = new Date("2026-11-10T12:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const ids: Record<string, string> = {};

const partner = async (name: string, data: Record<string, unknown> = {}) => {
  const id = (await createContact(owner, ws.id, { ...base, firstName: name })).id;
  await raw.contact.update({ where: { nodeId: id }, data: { stage: "PARTNER", stageChangedAt: ago(60), ...data } });
  ids[name] = id;
  return id;
};
const tree = (f: { root?: string; depth?: number } = {}, by = owner) => getTeamTree(by, ws.id, { depth: 3, ...f }, NOW);

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Лидер", timezone: "UTC" } })).id;
  member = (await t.db.user.create({ data: { email: "m@x.io", name: "Member" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO", contactPrivacy: "OPEN" } });
  await t.db.membership.create({ data: { userId: member, workspaceId: ws.id, role: "MEMBER", crmAccess: true, crmScope: "OWN" } });

  // You → Anna → Boris → Clara → Dmitri; You → Eva (newcomer, no work); Anna also brought a plain person.
  const me = await partner("Me", { linkedUserId: owner, ownerId: owner });
  const anna = await partner("Anna", { sponsorId: me, city: "Warsaw", messengers: { telegram: "@anna" } });
  const boris = await partner("Boris", { sponsorId: anna, city: "Kyiv" });
  const clara = await partner("Clara", { sponsorId: boris });
  await partner("Dmitri", { sponsorId: clara });
  await partner("Eva", { sponsorId: me, stageChangedAt: ago(20) });
  // Anna works with a person: finished a call 1 day ago and a meeting 2 days ago.
  const guest = (await createContact(owner, ws.id, { ...base, firstName: "Guest" })).id;
  await raw.contact.update({ where: { nodeId: guest }, data: { heldById: anna, sponsorId: anna } });
  await raw.crmActivity.create({ data: { workspaceId: ws.id, type: "CALL", subject: "c", ownerId: owner, contactId: guest, completedAt: ago(1) } });
  await raw.crmActivity.create({ data: { workspaceId: ws.id, type: "MEETING", subject: "m", ownerId: owner, contactId: guest, completedAt: ago(2) } });
  // Boris did something 5 days ago.
  const g2 = (await createContact(owner, ws.id, { ...base, firstName: "Guest2" })).id;
  await raw.contact.update({ where: { nodeId: g2 }, data: { heldById: boris } });
  await raw.crmActivity.create({ data: { workspaceId: ws.id, type: "MESSAGE", subject: "x", ownerId: owner, contactId: g2, completedAt: ago(5) } });
});
afterAll(async () => close());

describe("team tree", () => {
  it("opens three levels below the person's own card", async () => {
    const r = await tree();
    expect(r.nodes.map((n) => [n.name, n.level]).sort()).toEqual([["Anna", 1], ["Boris", 2], ["Clara", 3], ["Eva", 1]].sort());
    const clara = r.nodes.find((n) => n.name === "Clara")!;
    expect(clara.hasMore).toBe(true);
    expect(r.nodes.find((n) => n.name === "Dmitri")).toBeUndefined();
    expect(r.nodes.find((n) => n.name === "Me")).toBeUndefined();
  });

  it("opens a branch on request, from the partner asked for", async () => {
    const r = await tree({ root: ids.Clara, depth: 3 });
    expect(r.nodes.map((n) => n.name)).toEqual(["Dmitri"]);
    expect(r.nodes[0]?.parentId).toBe(ids.Clara);
  });

  it("counts touches and meetings of the last 7 days and colours by the last sign of work", async () => {
    const r = await tree();
    const anna = r.nodes.find((n) => n.name === "Anna")!;
    expect(anna).toMatchObject({ touches7: 1, meetings7: 1, invited: 1, heat: "green", city: "Warsaw", telegram: "@anna" });
    expect(r.nodes.find((n) => n.name === "Boris")!.heat).toBe("yellow");
    expect(r.nodes.find((n) => n.name === "Boris")!.touches7).toBe(1);
    // a newcomer for 20 days with no work at all
    expect(r.nodes.find((n) => n.name === "Eva")!.heat).toBe("red");
    expect(r.nodes.find((n) => n.name === "Anna")!.team).toBe(3);
  });

  it("moves the colours with the thresholds the owner sets, and only an owner or admin may", async () => {
    await expect(setTeamHeat(member, ws.id, { greenDays: 1, yellowDays: 2, newcomerDays: 3 })).rejects.toMatchObject({ status: 403 });
    expect((await getTeamHeat(member, ws.id)).canChange).toBe(false);
    await setTeamHeat(owner, ws.id, { greenDays: 1, yellowDays: 4, newcomerDays: 3 });
    const r = await tree();
    expect(r.nodes.find((n) => n.name === "Anna")!.heat).toBe("green"); // 1 day ago
    expect(r.nodes.find((n) => n.name === "Boris")!.heat).toBe("red"); // 5 days ago
    expect(r.settings).toEqual({ greenDays: 1, yellowDays: 4, newcomerDays: 3 });
    await setTeamHeat(owner, ws.id, { greenDays: 3, yellowDays: 7, newcomerDays: 7 });
  });

  it("shows a member of a private workspace only the partners they may see", async () => {
    await raw.workspace.update({ where: { id: ws.id }, data: { contactPrivacy: "PRIVATE" } });
    const r = await tree({}, member);
    expect(r.nodes).toEqual([]);
    await raw.workspace.update({ where: { id: ws.id }, data: { contactPrivacy: "OPEN" } });
  });

  it("returns nothing for a partner that is not in the workspace", async () => {
    expect((await tree({ root: "nope" })).nodes).toEqual([]);
  });
});
