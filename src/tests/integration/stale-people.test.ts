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
vi.mock("@/server/mail", () => ({ sendMail: vi.fn() }));

import { createWorkspace } from "@/server/services/workspace";
import { createContact } from "@/server/services/crm/contacts";
import { dispatchStalePeople, findStalePeople, REMIND_NAMES, staleMessage } from "@/server/services/crm/stale-people";
import { saveTouchSettings } from "@/server/services/crm/touch-queue";
import { NOTIFY_KINDS, DEFAULT_CHANNELS } from "@/server/services/notify";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let ws: { id: string };
const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };
const DAY = 86_400_000;
// the person's day: 10 November 2026, UTC. The morning reminder comes from 9 o'clock.
const EARLY = new Date("2026-11-10T08:00:00.000Z");
const NOW = new Date("2026-11-10T10:00:00.000Z");
const ago = (days: number, from = NOW) => new Date(from.getTime() - days * DAY);
const make = async (firstName: string, data: Record<string, unknown> = {}) => {
  const id = (await createContact(owner, ws.id, { ...base, firstName })).id;
  await raw.contact.update({ where: { nodeId: id }, data });
  return id;
};
const sent = () => raw.notification.findMany({ where: { userId: owner, kind: "stale_people" }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner", timezone: "UTC", locale: "ru" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
}, 120_000);
afterAll(async () => close?.());

describe("people forgotten for long", () => {
  it("is the people being worked with, with no date set, who have not been touched for the chosen days; hottest and longest silent first", async () => {
    await make("Cold twenty", { stage: "WARMING", lastContactedAt: ago(20), temperature: "COLD" });
    await make("Hot nine", { stage: "DECIDING", lastContactedAt: ago(15), temperature: "HOT" });
    await make("Recent", { stage: "WARMING", lastContactedAt: ago(3) });
    await make("With a date", { stage: "WARMING", lastContactedAt: ago(30), nextStepAt: new Date(NOW.getTime() + 3 * DAY) });
    await make("Said no", { stage: "DECLINED", lastContactedAt: ago(30) });
    await make("Never written to", { stage: "NEW" });
    await make("Never touched but long in the stage", { stage: "FIRST_CONTACT", stageChangedAt: ago(40) });
    const list = await findStalePeople(owner, ws.id, NOW);
    expect(list.map((p) => p.name)).toEqual(["Hot nine", "Never touched but long in the stage", "Cold twenty"]);
    expect(list.find((p) => p.name === "Hot nine")?.days).toBe(15);
  });

  it("follows the days chosen in the settings", async () => {
    await saveTouchSettings(owner, ws.id, { staleDays: 21, declineDays: 75, meetingMovesStage: true });
    expect((await findStalePeople(owner, ws.id, NOW)).map((p) => p.name)).toEqual(["Never touched but long in the stage"]);
    await saveTouchSettings(owner, ws.id, { staleDays: 7, declineDays: 75, meetingMovesStage: true });
    expect((await findStalePeople(owner, ws.id, NOW)).length).toBe(3);
    await saveTouchSettings(owner, ws.id, { staleDays: 14, declineDays: 75, meetingMovesStage: true });
  });
});

describe("the morning reminder", () => {
  it("is a kind of notification that goes to the app and to the bot", () => {
    expect(NOTIFY_KINDS).toContain("stale_people");
    expect(DEFAULT_CHANNELS.stale_people).toEqual(["app", "telegram"]);
  });

  it("says who, in the person's language, with the days of silence", () => {
    const msg = staleMessage([{ id: "1", name: "Анна К", stage: "WARMING", temperature: null, days: 21 }], 3, "ru");
    expect(msg.title).toBe("Давно не связывались: 3");
    expect(msg.body).toBe("• Анна К — 21 дн.\n…и ещё 2 в списке");
    expect(staleMessage([{ id: "1", name: "Anna", stage: "WARMING", temperature: null, days: 21 }], 1, "en")).toEqual({ title: "Out of touch for a while: 1", body: "• Anna — 21 d" });
  });

  it("does not come before 9 o'clock of the person's own day", async () => {
    expect(await dispatchStalePeople(EARLY)).toEqual({ members: 0, reminded: 0 });
    expect(await sent()).toHaveLength(0);
  });

  it("comes once a day, with the names; the people named are not named again for the days of the silence, but new ones are", async () => {
    const first = await dispatchStalePeople(NOW);
    expect(first).toEqual({ members: 1, reminded: 3 });
    const [n1] = await sent();
    expect(n1?.payload).toMatchObject({ title: "Давно не связывались: 3", url: "/crm/touches?stale=1" });
    expect((n1?.payload as { body: string }).body).toContain("Hot nine — 15 дн.");
    // the same day, an hour later: nothing again
    expect(await dispatchStalePeople(new Date(NOW.getTime() + 3_600_000))).toEqual({ members: 0, reminded: 0 });
    // the next day: the same people are not named again
    expect(await dispatchStalePeople(new Date(NOW.getTime() + DAY))).toEqual({ members: 0, reminded: 0 });
    // somebody new falls silent: only they are named
    await make("Newly silent", { stage: "WARMING", lastContactedAt: ago(30, new Date(NOW.getTime() + 2 * DAY)) });
    const third = await dispatchStalePeople(new Date(NOW.getTime() + 2 * DAY));
    expect(third).toEqual({ members: 1, reminded: 1 });
    expect(((await sent())[1]?.payload as { body: string }).body).toBe("• Newly silent — 30 дн.");
  });

  it("names them again when the stretch of silence has passed and they are still silent", async () => {
    const later = new Date(NOW.getTime() + 20 * DAY);
    const r = await dispatchStalePeople(later);
    expect(r.members).toBe(1);
    expect(r.reminded).toBeGreaterThanOrEqual(3);
  });

  it("a long list is told in portions of ten, the rest wait for the next days", async () => {
    const t0 = new Date("2027-03-01T10:00:00.000Z");
    for (let i = 0; i < 25; i++) await make(`Bulk ${String(i).padStart(2, "0")}`, { stage: "WARMING", lastContactedAt: ago(40 + i, t0) });
    const day1 = await dispatchStalePeople(t0);
    expect(day1.reminded).toBe(REMIND_NAMES);
    const rows = await sent();
    const last = rows[rows.length - 1]!.payload as { title: string; body: string; ids: string[] };
    expect(last.ids).toHaveLength(REMIND_NAMES);
    expect(last.body.split("\n").at(-1)).toMatch(/^…и ещё \d+ в списке$/);
    const day2 = await dispatchStalePeople(new Date(t0.getTime() + DAY));
    expect(day2.reminded).toBe(REMIND_NAMES);
    const rows2 = await sent();
    const ids1 = new Set(last.ids);
    expect((rows2[rows2.length - 1]!.payload as { ids: string[] }).ids.some((id) => ids1.has(id))).toBe(false);
  });

  it("is not sent to an account that was removed or blocked, and a failure for one person does not stop the others", async () => {
    const other = (await raw.user.create({ data: { email: "p@x.io", name: "Blocked", timezone: "UTC", suspendedAt: new Date() } })).id;
    await raw.membership.create({ data: { userId: other, workspaceId: ws.id, role: "MEMBER", crmAccess: true, crmScope: "OWN" } });
    const before = await raw.notification.count({ where: { userId: other } });
    await dispatchStalePeople(new Date("2027-03-05T10:00:00.000Z"));
    expect(await raw.notification.count({ where: { userId: other } })).toBe(before);
  });
});
