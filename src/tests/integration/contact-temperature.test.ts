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
import { createActivity } from "@/server/services/crm/activities";
import { recalcTemperatures, refreshTemperature } from "@/server/services/crm/temperature";
import { run } from "@/server/jobs";
import { MANUAL_HOLD_DAYS } from "@/modules/crm/temperature";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let ws: { id: string };
const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };
const make = async (firstName: string, extra: Record<string, unknown> = {}) => (await createContact(owner, ws.id, { ...base, firstName, ...extra })).id;
const temp = async (id: string) => (await raw.contact.findUniqueOrThrow({ where: { nodeId: id } })).temperature;
const done = (contactId: string, type: "MESSAGE" | "MEETING" | "CALL", completedAt: Date, extra: Record<string, unknown> = {}) =>
  raw.crmActivity.create({ data: { workspaceId: ws.id, type, subject: `${type} done`, ownerId: owner, contactId, completedAt, dueAt: completedAt, ...extra } });
const day = 86_400_000;

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
}, 120_000);
afterAll(async () => close?.());

describe("the temperature of people", () => {
  it("a new name is cold from the start, and one added far along the funnel can be warm", async () => {
    expect(await temp(await make("Plain"))).toBe("COLD");
    expect(await temp(await make("Deciding", { stage: "DECIDING" }))).toBe("WARM"); // 4 points for the stage
    expect(await temp(await make("Client", { stage: "CLIENT" }))).toBeNull(); // a client has no temperature
  });

  it("a meeting that was held warms the person at once, with no one touching the temperature", async () => {
    const id = await make("Presented", { stage: "PRESENTATION" });
    expect(await temp(id)).toBe("WARM"); // 3 points for the stage, no history
    await createActivity(owner, ws.id, { type: "MEETING", subject: "Presentation", dueAt: new Date().toISOString(), completed: true, contactId: id });
    expect(await temp(id)).toBe("HOT"); // 3 stage + 3 meeting + half a point
  });

  it("moving a person along the funnel works it out again", async () => {
    const id = await make("Moves");
    await raw.crmActivity.create({ data: { workspaceId: ws.id, type: "MESSAGE", subject: "m", ownerId: owner, contactId: id, completedAt: new Date(), dueAt: new Date() } });
    await raw.contact.update({ where: { nodeId: id }, data: { lastContactedAt: new Date() } });
    await updateContact(owner, id, { stage: "DECIDING" });
    expect(await temp(id)).toBe("WARM"); // 4 stage + a touch + a move forward = 5.5, just short of hot
  });

  it("a person who said no is cold whatever else is true", async () => {
    const id = await make("Said no", { stage: "DECIDING" });
    await updateContact(owner, id, { stage: "DECLINED" });
    expect(await temp(id)).toBe("COLD");
  });
});

describe("a temperature set by hand", () => {
  it("holds for 14 days: a new touch does not change it, and the card says until when", async () => {
    const id = await make("Manual", { stage: "PRESENTATION" });
    await updateContact(owner, id, { temperature: "COLD" });
    const card = await getContact(owner, id);
    expect(card.temperature).toBe("COLD");
    const hold = card.temperatureManualUntil as Date;
    expect(Math.round((hold.getTime() - Date.now()) / day)).toBe(MANUAL_HOLD_DAYS);
    await createActivity(owner, ws.id, { type: "MEETING", subject: "Presentation", dueAt: new Date().toISOString(), completed: true, contactId: id });
    expect(await temp(id)).toBe("COLD"); // the computed value would be hot
    expect(await recalcTemperatures()).toMatchObject({ checked: expect.any(Number) });
    expect(await temp(id)).toBe("COLD"); // and the nightly job leaves it alone
  });

  it("after 14 days the computed one takes over again", async () => {
    const id = await make("Expires", { stage: "PRESENTATION" });
    await updateContact(owner, id, { temperature: "COLD" });
    await done(id, "MEETING", new Date(Date.now() - 1 * day));
    await raw.contact.update({ where: { nodeId: id }, data: { temperatureManualUntil: new Date(Date.now() - 1000) } });
    await recalcTemperatures();
    expect(await temp(id)).toBe("HOT");
    expect((await getContact(owner, id)).temperatureManualUntil).toBeNull();
  });

  it("clearing it hands the decision back at once", async () => {
    const id = await make("Cleared", { stage: "PRESENTATION" });
    await updateContact(owner, id, { temperature: "COLD" });
    await done(id, "MEETING", new Date(Date.now() - 1 * day));
    await updateContact(owner, id, { temperature: null });
    expect(await temp(id)).toBe("HOT");
    expect((await getContact(owner, id)).temperatureManualUntil).toBeNull();
  });
});

describe("cooling and the one-time pass", () => {
  it("people cool as the days pass: the same person, looked at later by the nightly job", async () => {
    const id = await make("Cools", { stage: "PRESENTATION" });
    const then = new Date(Date.now() - 2 * day);
    await done(id, "MEETING", then);
    await raw.contact.update({ where: { nodeId: id }, data: { lastContactedAt: then } });
    await refreshTemperature(raw, id, new Date());
    expect(await temp(id)).toBe("HOT"); // 3 + 3 + half a point
    await recalcTemperatures({ now: new Date(Date.now() + 40 * day) });
    expect(await temp(id)).toBe("COLD"); // the meeting is old, 40 days of silence
  });

  it("the job named for it runs the same pass", async () => {
    const id = await make("Job");
    await raw.contact.update({ where: { nodeId: id }, data: { temperature: null } });
    expect(await run("crm/temperature")).toMatchObject({ checked: expect.any(Number), changed: expect.any(Number) });
    expect(await temp(id)).toBe("COLD");
  });

  it("the one-time pass fills in everyone who had no temperature, and leaves clients and partners without", async () => {
    const a = await make("Old A", { stage: "WARMING" });
    const b = await make("Old B", { stage: "DECIDING" });
    const client = await make("Old client", { stage: "CLIENT" });
    const partner = await make("Old partner", { stage: "PARTNER" });
    await raw.contact.updateMany({ where: { nodeId: { in: [a, b, client, partner] } }, data: { temperature: null, temperatureManualUntil: null } });
    const r = await recalcTemperatures({ workspaceId: ws.id });
    expect(r.changed).toBeGreaterThanOrEqual(2);
    expect(await temp(a)).toBe("COLD");
    expect(await temp(b)).toBe("WARM");
    expect(await temp(client)).toBeNull();
    expect(await temp(partner)).toBeNull();
    // run again: nothing left to change
    expect((await recalcTemperatures({ workspaceId: ws.id })).changed).toBe(0);
  });
});
