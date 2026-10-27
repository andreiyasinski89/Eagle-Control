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
import { addPeople, listPeople } from "@/server/services/crm/people";
import { assignToGroup, createGroup, deleteGroup, listGroups, updateGroup } from "@/server/services/crm/groups";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let outsider: string;
let ws: { id: string };
let other: { id: string };

const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };
const q = { due: "0" as const };
const names = async (group?: string) => (await listPeople(owner, ws.id, { ...q, group })).items.map((i) => i.name).sort();

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  outsider = (await t.db.user.create({ data: { email: "x@x.io", name: "Out" } })).id;
  ws = await createWorkspace(owner, "Acme");
  other = await createWorkspace(outsider, "Other");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
}, 120_000);
afterAll(async () => close?.());

describe("groups and subgroups of people", () => {
  let cold: { id: string };
  let gym: { id: string };
  let deep: { id: string };

  it("makes a tree, three levels at most, no twin names on one level", async () => {
    cold = await createGroup(owner, ws.id, { name: "Cold market" });
    gym = await createGroup(owner, ws.id, { name: "Gym", parentId: cold.id });
    deep = await createGroup(owner, ws.id, { name: "Morning class", parentId: gym.id });
    await expect(createGroup(owner, ws.id, { name: "Fourth", parentId: deep.id })).rejects.toMatchObject({ code: "group_too_deep" });
    await expect(createGroup(owner, ws.id, { name: "cold MARKET" })).rejects.toMatchObject({ code: "group_exists" });
    const sameNameElsewhere = await createGroup(owner, ws.id, { name: "Gym" });
    expect(sameNameElsewhere.id).not.toBe(gym.id);
  });

  it("puts people in a group on creation, by bulk add and by edit, and only in a group of the same workspace", async () => {
    const foreign = await createGroup(outsider, other.id, { name: "Foreign" });
    await expect(createContact(owner, ws.id, { ...base, firstName: "Bad", groupId: foreign.id })).rejects.toMatchObject({ code: "invalid_group" });
    await createContact(owner, ws.id, { ...base, firstName: "Ivan", groupId: gym.id });
    const added = await addPeople(owner, ws.id, { people: [{ name: "Olga" }, { name: "Petr" }], stage: "NEW", groupId: deep.id });
    expect(added.created).toBe(2);
    const free = await createContact(owner, ws.id, { ...base, firstName: "Zoya" });
    await expect(updateContact(owner, free.id, { groupId: foreign.id })).rejects.toMatchObject({ code: "invalid_group" });
    await updateContact(owner, free.id, { groupId: cold.id });
    expect((await getContact(owner, free.id)).groupId).toBe(cold.id);
    await updateContact(owner, free.id, { groupId: null });
    expect((await getContact(owner, free.id)).groupId).toBeNull();
  });

  it("counts people per group, with and without the subgroups, and filters the board the same way", async () => {
    const l = await listGroups(owner, ws.id);
    expect(l.items.find((i) => i.id === cold.id)).toMatchObject({ own: 0, total: 3 });
    expect(l.items.find((i) => i.id === gym.id)).toMatchObject({ own: 1, total: 3 });
    expect(l.items.find((i) => i.id === deep.id)).toMatchObject({ own: 2, total: 2 });
    expect(l.ungrouped).toBe(1);
    expect(l.all).toBe(4);
    expect(await names(cold.id)).toEqual(["Ivan", "Olga", "Petr"]);
    expect(await names(gym.id)).toEqual(["Ivan", "Olga", "Petr"]);
    expect(await names(deep.id)).toEqual(["Olga", "Petr"]);
    expect(await names("none")).toEqual(["Zoya"]);
    expect(await names()).toHaveLength(4);
  });

  it("assigns many people at once, and takes them out of groups", async () => {
    const ids = (await listPeople(owner, ws.id, { ...q, group: deep.id })).items.map((i) => i.id);
    const r = await assignToGroup(owner, ws.id, { ids, groupId: cold.id });
    expect(r.updated).toBe(2);
    expect(await names(deep.id)).toEqual([]);
    await assignToGroup(owner, ws.id, { ids, groupId: null });
    expect(await names("none")).toEqual(["Olga", "Petr", "Zoya"]);
    await expect(assignToGroup(owner, ws.id, { ids, groupId: "nope" })).rejects.toMatchObject({ code: "invalid_group" });
    await assignToGroup(owner, ws.id, { ids, groupId: deep.id });
  });

  it("renames, recolours and moves a group, but never into itself or past three levels", async () => {
    const renamed = await updateGroup(owner, gym.id, { name: "Fitness", color: "#16a34a" });
    expect(renamed).toMatchObject({ name: "Fitness", color: "#16a34a" });
    await expect(updateGroup(owner, cold.id, { parentId: deep.id })).rejects.toMatchObject({ code: "group_cycle" });
    await expect(updateGroup(owner, cold.id, { parentId: cold.id })).rejects.toMatchObject({ code: "group_cycle" });
    const top = await createGroup(owner, ws.id, { name: "Warm market" });
    await expect(updateGroup(owner, top.id, { parentId: deep.id })).rejects.toMatchObject({ code: "group_too_deep" });
    await updateGroup(owner, deep.id, { parentId: top.id });
    expect(await names(top.id)).toEqual(["Olga", "Petr"]);
    expect(await names(cold.id)).toEqual(["Ivan"]);
    await updateGroup(owner, deep.id, { parentId: gym.id });
  });

  it("removing a group keeps its people and subgroups, moving them up", async () => {
    const r = await deleteGroup(owner, gym.id);
    expect(r.people).toBe(1);
    expect((await raw.contactGroup.findUnique({ where: { id: deep.id } }))?.parentId).toBe(cold.id);
    expect(await names(cold.id)).toEqual(["Ivan", "Olga", "Petr"]);
    expect(await raw.contact.count({ where: { workspaceId: ws.id } })).toBe(4);
  });

  it("is closed to people outside the workspace", async () => {
    await expect(listGroups(outsider, ws.id)).rejects.toBeTruthy();
    await expect(createGroup(outsider, ws.id, { name: "Sneak" })).rejects.toBeTruthy();
    await expect(updateGroup(outsider, cold.id, { name: "Hacked" })).rejects.toBeTruthy();
    await expect(deleteGroup(outsider, cold.id)).rejects.toBeTruthy();
    expect(await raw.contactGroup.findUnique({ where: { id: cold.id } })).toMatchObject({ name: "Cold market" });
  });
});
