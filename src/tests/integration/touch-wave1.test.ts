import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { createTestDb } from "./pg";

const holder = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/server/db", () => ({
  get db() {
    return holder.db;
  },
}));
vi.mock("@/server/mail", () => ({ sendMail: vi.fn(async () => undefined) }));
vi.mock("@/server/storage", () => ({ deleteObject: vi.fn(), presignUpload: vi.fn(), presignDownload: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { createActivity } from "@/server/services/crm/activities";
import { createContact } from "@/server/services/crm/contacts";
import { recordTouchResult, undoTouch } from "@/server/services/crm/touch-queue";
import { workspaceCalendar } from "@/server/services/nodes/views";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let other: string;
let ws: { id: string };
const base = { emails: [], phones: [], messengers: {}, allowDuplicate: false, consentGiven: true };

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  other = (await t.db.user.create({ data: { email: "p@x.io", name: "Other" } })).id;
  ws = await createWorkspace(owner, "W1");
}, 120_000);
afterAll(async () => close?.());

describe("a touch written down by the chat button can be taken back exactly", () => {
  it("undo puts the stage, the next step and the last touch back, and removes the record", async () => {
    const id = (await createContact(owner, ws.id, { ...base, firstName: "Ира", ownerId: owner, stage: "NEW", nextStep: "Написать первой", nextStepAt: "2026-11-07T00:00:00.000Z" })).id;
    const before = await raw.contact.findUniqueOrThrow({ where: { nodeId: id } });
    const r = await recordTouchResult(owner, id, { outcome: "WAITING", message: "Привет!", channel: "telegram", locale: "ru" });
    expect((await raw.contact.findUniqueOrThrow({ where: { nodeId: id } })).stage).toBe("FIRST_CONTACT");
    await undoTouch(owner, id, { activityId: r.activityId, before: r.before });
    const after = await raw.contact.findUniqueOrThrow({ where: { nodeId: id } });
    expect(after.stage).toBe("NEW");
    expect(after.nextStep).toBe("Написать первой");
    expect(after.nextStepAt).toEqual(before.nextStepAt);
    expect(after.lastContactedAt).toBeNull();
    expect(await raw.crmActivity.count({ where: { id: r.activityId } })).toBe(0);
  });

  it("only one's own fresh 'waiting' touch can be taken back", async () => {
    const id = (await createContact(owner, ws.id, { ...base, firstName: "Олег", ownerId: owner, stage: "WARMING" })).id;
    const replied = await recordTouchResult(owner, id, { outcome: "REPLIED", locale: "ru" });
    await expect(undoTouch(owner, id, { activityId: replied.activityId, before: replied.before })).rejects.toThrow(/no longer/);
    const waiting = await recordTouchResult(owner, id, { outcome: "WAITING", locale: "ru" });
    await expect(undoTouch(other, id, { activityId: waiting.activityId, before: waiting.before })).rejects.toBeTruthy();
    await expect(undoTouch(owner, id, { activityId: waiting.activityId, before: waiting.before }, new Date(Date.now() + 20 * 60_000))).rejects.toThrow(/no longer/);
  });
});

describe("the calendar shows what is planned, not every message sent", () => {
  it("a sent message is not in the hour grid; a planned meeting is", async () => {
    const id = (await createContact(owner, ws.id, { ...base, firstName: "Аня", ownerId: owner, stage: "WARMING" })).id;
    await recordTouchResult(owner, id, { outcome: "WAITING", message: "Как дела?", locale: "ru" });
    const tomorrow = new Date(Date.now() + 86_400_000);
    await createActivity(owner, ws.id, { type: "MEETING", subject: "Презентация Ане", contactId: id, dueAt: tomorrow.toISOString(), durationMin: 60 });
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const { items } = await workspaceCalendar(owner, ws.id, { from: day(new Date(Date.now() - 86_400_000)), to: day(new Date(Date.now() + 3 * 86_400_000)), mine: "0" });
    const titles = items.filter((i) => i.kind === "crm_activity").map((i) => i.title);
    expect(titles).toContain("Презентация Ане");
    expect(titles.some((x) => x.startsWith("Касание"))).toBe(false);
  });
});
