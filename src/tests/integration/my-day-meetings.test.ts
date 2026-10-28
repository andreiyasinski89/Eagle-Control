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
import { createNode, createProject, transact } from "@/server/services/nodes/ops";
import { createActivity } from "@/server/services/crm/activities";
import { createContact } from "@/server/services/crm/contacts";
import { getMyDay } from "@/server/services/crm/my-day";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let ws: { id: string };
let projectId: string;
let contactId: string;

// 2026-11-03, noon in UTC: the person's day is 3 November.
const NOW = new Date("2026-11-03T12:00:00.000Z");
type Type = "MEETING" | "CALL" | "MESSAGE";
const act = (type: Type, subject: string, dueAt: string | null, completed?: boolean) => createActivity(owner, ws.id, { type, subject, dueAt, completed, contactId });
const event = (title: string, startsAt: string, endsAt: string) => transact(owner, (ctx) => createNode(ctx, { parentId: projectId, type: "EVENT", title, data: { startsAt, endsAt, attendeeIds: [owner] } }));

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner", timezone: "UTC" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  projectId = (await createProject(owner, ws.id, { name: "Launch", template: "empty", estimationUnit: "HOURS" })).project.id;
  contactId = (await createContact(owner, ws.id, { firstName: "Anna", lastName: "E", emails: ["a@e.io"], phones: [], messengers: {}, allowDuplicate: false, consentGiven: false })).id;
}, 120_000);
afterAll(async () => close?.());

describe("My day: meetings of the plan", () => {
  it("a done meeting from the CRM counts as held, a planned one as planned", async () => {
    await act("MEETING", "Созвон и презентация по видео", "2026-11-03T10:00:00.000Z", true);
    let { plan } = await getMyDay(owner, ws.id, NOW);
    expect(plan.meetings).toEqual({ planned: 1, done: 1 });
    await act("MEETING", "Презентация вечером", "2026-11-03T16:00:00.000Z", false);
    ({ plan } = await getMyDay(owner, ws.id, NOW));
    expect(plan.meetings).toEqual({ planned: 2, done: 1 });
  });

  it("a meeting written down afterwards, with no date of its own, counts for today", async () => {
    // logged "done" now: no date, completed at NOW
    const logged = await act("MEETING", "Встреча без даты", null);
    expect(logged.completedAt).not.toBeNull();
    await raw.crmActivity.update({ where: { id: logged.id }, data: { completedAt: new Date("2026-11-03T11:30:00.000Z") } });
    const { plan } = await getMyDay(owner, ws.id, NOW);
    expect(plan.meetings).toEqual({ planned: 3, done: 2 });
  });

  it("a meeting planned for another day and marked done today counts today; other days' meetings do not", async () => {
    const early = await act("MEETING", "Planned yesterday, held today", "2026-11-02T15:00:00.000Z", false);
    await raw.crmActivity.update({ where: { id: early.id }, data: { completedAt: new Date("2026-11-03T08:00:00.000Z") } });
    const old = await act("MEETING", "Held yesterday", "2026-11-02T09:00:00.000Z", true);
    await raw.crmActivity.update({ where: { id: old.id }, data: { completedAt: new Date("2026-11-02T09:30:00.000Z") } });
    await act("MEETING", "Tomorrow", "2026-11-04T09:00:00.000Z", false);
    const { plan } = await getMyDay(owner, ws.id, NOW);
    expect(plan.meetings).toEqual({ planned: 4, done: 3 });
  });

  it("a project event is counted with them: held once it has ended, to come while it has not", async () => {
    await event("Stand-up", "2026-11-03T09:00:00.000Z", "2026-11-03T09:30:00.000Z");
    await event("Review", "2026-11-03T15:00:00.000Z", "2026-11-03T16:00:00.000Z");
    const { plan } = await getMyDay(owner, ws.id, NOW);
    expect(plan.meetings).toEqual({ planned: 6, done: 4 }); // 4 CRM (3 held) + 2 events (1 held)
  });

  it("calls and messages stay with the follow-ups and never with the meetings, so nothing is counted twice", async () => {
    await act("CALL", "Call done", "2026-11-03T08:00:00.000Z", true);
    await act("CALL", "Call open", "2026-11-03T17:00:00.000Z", false);
    const message = await act("MESSAGE", "Message logged", null);
    await raw.crmActivity.update({ where: { id: message.id }, data: { completedAt: new Date("2026-11-03T11:45:00.000Z") } });
    const { plan } = await getMyDay(owner, ws.id, NOW);
    expect(plan.meetings).toEqual({ planned: 6, done: 4 });
    expect(plan.followUps).toEqual({ planned: 3, done: 2 }); // two calls and the message; the meetings are not in here
  });

  it("efficiency and productivity follow the corrected counts", async () => {
    const { plan } = await getMyDay(owner, ws.id, NOW);
    expect(plan).toMatchObject({ planned: 9, done: 6, efficiency: 67, productivity: 67 }); // 6 of 9; nothing in the backlog
  });

  it("lists the open meeting and call as scheduled, and the CRM plan of the day holds all of today's items", async () => {
    const d = await getMyDay(owner, ws.id, NOW);
    expect(d.scheduled.map((s) => s.subject).sort()).toEqual(["Call open", "Презентация вечером"]);
    const subjects = d.crmDay.map((s) => s.subject);
    expect(subjects).toEqual(expect.arrayContaining(["Созвон и презентация по видео", "Встреча без даты", "Planned yesterday, held today", "Call done", "Message logged"]));
    expect(subjects).not.toContain("Held yesterday");
    expect(subjects).not.toContain("Tomorrow");
  });

  it("a calendar event marked done counts as held at once, before its time is over, and says so", async () => {
    const before = (await getMyDay(owner, ws.id, NOW)).plan.meetings;
    const review = (await getMyDay(owner, ws.id, NOW)).events.find((e) => e.title === "Review");
    expect(review).toMatchObject({ done: false, repeats: false });
    await raw.node.update({ where: { id: review?.id as string }, data: { status: "DONE" } });
    const d = await getMyDay(owner, ws.id, NOW);
    expect(d.plan.meetings).toEqual({ planned: before.planned, done: before.done + 1 }); // Review runs 15:00-16:00, NOW is noon
    expect(d.events.find((e) => e.title === "Review")?.done).toBe(true);
  });

  it("a series has no single done: the status of the node does not make its dates held", async () => {
    const series = (await transact(owner, (ctx) => createNode(ctx, { parentId: projectId, type: "EVENT", title: "Weekly", data: { startsAt: "2026-10-27T15:00:00.000Z", endsAt: "2026-10-27T16:00:00.000Z", attendeeIds: [owner], repeat: { freq: "WEEKLY", interval: 1, tz: "UTC", skip: [] } } }))).result.id;
    await raw.node.update({ where: { id: series }, data: { status: "DONE" } });
    const d = await getMyDay(owner, ws.id, NOW);
    expect(d.events.find((e) => e.title === "Weekly")).toMatchObject({ repeats: true, done: false });
  });
});
