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
import { createContact } from "@/server/services/crm/contacts";
import { activitySchema, createActivity, deleteActivity, listActivities, updateActivity } from "@/server/services/crm/activities";
import { workspaceCalendar } from "@/server/services/nodes/views";

let close: () => Promise<void>;
let owner: string;
let other: string;
let ws: { id: string };
let contactId: string;

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  other = (await t.db.user.create({ data: { email: "m@x.io", name: "Other" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.membership.create({ data: { userId: other, workspaceId: ws.id, role: "MEMBER" } });
  contactId = (await createContact(owner, ws.id, { firstName: "Anna", lastName: "Example", emails: ["anna@example.com"], phones: [], messengers: {}, allowDuplicate: false, consentGiven: false })).id;
}, 120_000);
afterAll(async () => close?.());

const planned = { type: "CALL" as const, subject: "Call with Anna", dueAt: "2026-11-03T14:00:00.000Z", durationMin: 30, completed: false };
const range = { from: "2026-11-01", to: "2026-11-10", mine: "0" as const };

describe("scheduling a contact", () => {
  it("accepts a length of 5 minutes to a day, nothing else", () => {
    expect(activitySchema.safeParse({ ...planned, durationMin: 5 }).success).toBe(true);
    expect(activitySchema.safeParse({ ...planned, durationMin: 1440 }).success).toBe(true);
    for (const durationMin of [0, 4, 1441, 30.5]) expect(activitySchema.safeParse({ ...planned, durationMin }).success, String(durationMin)).toBe(false);
  });

  it("a planned call stays open and shows in the calendar as a block with its length", async () => {
    const a = await createActivity(owner, ws.id, { ...planned, contactId });
    expect(a).toMatchObject({ type: "CALL", durationMin: 30, completedAt: null, ownerId: owner });
    const cal = await workspaceCalendar(owner, ws.id, range);
    const item = cal.items.find((i) => i.id === a.id);
    expect(item).toMatchObject({ kind: "crm_activity", title: "Call with Anna", at: "2026-11-03T14:00:00.000Z", endAt: "2026-11-03T14:30:00.000Z", done: false, href: `/crm/contacts?contact=${contactId}` });
  });

  it("appears under only-mine for its owner and not for someone else", async () => {
    expect((await workspaceCalendar(owner, ws.id, { ...range, mine: "1" })).items.some((i) => i.title === "Call with Anna")).toBe(true);
    expect((await workspaceCalendar(other, ws.id, { ...range, mine: "1" })).items.some((i) => i.title === "Call with Anna")).toBe(false);
  });

  it("one with no length is still a point in time", async () => {
    const a = await createActivity(owner, ws.id, { type: "MEETING", subject: "Quick sync", dueAt: "2026-11-04T09:00:00.000Z", completed: false, contactId });
    const item = (await workspaceCalendar(owner, ws.id, range)).items.find((i) => i.id === a.id);
    expect(item).toMatchObject({ at: "2026-11-04T09:00:00.000Z", endAt: null });
  });

  it("is listed on the contact as open, with its length", async () => {
    const open = await listActivities(owner, ws.id, { contactId, status: "open", page: 1, pageSize: 50 });
    expect(open.items.map((i) => i.subject).sort()).toEqual(["Call with Anna", "Quick sync"]);
    expect(open.items.find((i) => i.subject === "Call with Anna")?.durationMin).toBe(30);
  });

  it("moving it moves the block; marking it done keeps it in the calendar but closed; removing it takes it out", async () => {
    const a = (await listActivities(owner, ws.id, { contactId, status: "open", page: 1, pageSize: 50 })).items.find((i) => i.subject === "Call with Anna") as { id: string };
    await updateActivity(owner, a.id, { dueAt: "2026-11-05T10:00:00.000Z", durationMin: 45 });
    let item = (await workspaceCalendar(owner, ws.id, range)).items.find((i) => i.id === a.id);
    expect(item).toMatchObject({ at: "2026-11-05T10:00:00.000Z", endAt: "2026-11-05T10:45:00.000Z" });

    await updateActivity(owner, a.id, { completed: true });
    item = (await workspaceCalendar(owner, ws.id, range)).items.find((i) => i.id === a.id);
    expect(item?.done).toBe(true);
    expect((await listActivities(owner, ws.id, { contactId, status: "open", page: 1, pageSize: 50 })).items.some((i) => i.id === a.id)).toBe(false);
    expect((await holder.db.contact.findUniqueOrThrow({ where: { nodeId: contactId } })).lastContactedAt).not.toBeNull();

    await deleteActivity(owner, a.id);
    expect((await workspaceCalendar(owner, ws.id, range)).items.some((i) => i.id === a.id)).toBe(false);
  });

  it("a member without CRM access cannot plan anything", async () => {
    const m = await holder.db.membership.findUniqueOrThrow({ where: { userId_workspaceId: { userId: other, workspaceId: ws.id } } });
    await holder.db.membership.update({ where: { id: m.id }, data: { crmAccess: false } });
    await expect(createActivity(other, ws.id, { ...planned, contactId })).rejects.toMatchObject({ status: 403 });
  });
});
