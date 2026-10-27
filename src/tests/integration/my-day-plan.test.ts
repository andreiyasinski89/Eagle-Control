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
import { listMyTasks } from "@/server/services/nodes/my-tasks";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let guest: string;
let ws: { id: string };
let epicId: string;
let projectId: string;

// 2026-11-03 12:00 UTC is already the morning of 4 November in Auckland (UTC+13).
const NOW = new Date("2026-11-03T12:00:00.000Z");

async function task(title: string, due: string | null, status: "TODO" | "DONE" | "CANCELLED" = "TODO", assignee: string | null = owner) {
  const { result } = await transact(owner, (ctx) => createNode(ctx, { parentId: epicId, type: "TASK", title, dueDate: due, assigneeId: assignee }));
  if (status !== "TODO") await raw.node.update({ where: { id: result.id }, data: { status, ...(status === "DONE" ? { progress: 100 } : {}) } });
  return result.id;
}

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  guest = (await t.db.user.create({ data: { email: "g@x.io", name: "Guest" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  projectId = (await createProject(owner, ws.id, { name: "Launch", template: "empty", estimationUnit: "HOURS" })).project.id;
  epicId = (await transact(owner, (ctx) => createNode(ctx, { parentId: projectId, type: "EPIC", title: "Epic" }))).result.id;
}, 120_000);
afterAll(async () => close?.());

describe("My day: plan against fact", () => {
  it("is empty and measurable-less when nothing is planned", async () => {
    const d = await getMyDay(owner, ws.id, NOW);
    expect(d.plan).toMatchObject({ planned: 0, done: 0, efficiency: null, productivity: null, trackedMinutes: 0 });
    expect(d.timeZone).toBe("UTC");
  });

  it("counts what is due today, finished or not, and the backlog on both sides", async () => {
    await raw.user.update({ where: { id: owner }, data: { timezone: "UTC" } });
    // tasks: due 3 Nov (today in UTC): one done, two open; one cancelled and one assigned to someone else do not count
    await task("Done today", "2026-11-03T00:00:00.000Z", "DONE");
    await task("Open A", "2026-11-03T00:00:00.000Z");
    await task("Open B", "2026-11-03T00:00:00.000Z");
    await task("Dropped", "2026-11-03T00:00:00.000Z", "CANCELLED");
    await task("Not mine", "2026-11-03T00:00:00.000Z", "TODO", null);
    // backlog: due earlier — one still open, one finished today (a status event inside today)
    await task("Late, open", "2026-11-01T00:00:00.000Z");
    const cleared = await task("Late, finished today", "2026-11-01T00:00:00.000Z", "DONE");
    await raw.nodeStatusEvent.create({ data: { nodeId: cleared, projectId, fromStatus: "TODO", toStatus: "DONE", at: new Date("2026-11-03T09:30:00.000Z"), actorId: owner } });
    // finished long ago: neither planned nor cleared today
    const old = await task("Late, finished last week", "2026-10-20T00:00:00.000Z", "DONE");
    await raw.nodeStatusEvent.create({ data: { nodeId: old, projectId, fromStatus: "TODO", toStatus: "DONE", at: new Date("2026-10-25T09:30:00.000Z"), actorId: owner } });

    // meetings: one over, one still to come (events count as held once they have ended)
    await transact(owner, (ctx) => createNode(ctx, { parentId: projectId, type: "EVENT", title: "Stand-up", data: { startsAt: "2026-11-03T09:00:00.000Z", endsAt: "2026-11-03T09:30:00.000Z", attendeeIds: [owner] } }));
    await transact(owner, (ctx) => createNode(ctx, { parentId: projectId, type: "EVENT", title: "Review", data: { startsAt: "2026-11-03T15:00:00.000Z", endsAt: "2026-11-03T16:00:00.000Z", attendeeIds: [owner] } }));
    // CRM: a call done, a call open, a follow-up done, a follow-up open, an old follow-up open and one finished today
    const contactId = (await createContact(owner, ws.id, { firstName: "Anna", lastName: "E", emails: ["a@e.io"], phones: [], messengers: {}, allowDuplicate: false, consentGiven: false })).id;
    const act = (type: "CALL" | "TASK", subject: string, dueAt: string, completed: boolean) => createActivity(owner, ws.id, { type, subject, dueAt, completed, contactId });
    await act("CALL", "Call done", "2026-11-03T08:00:00.000Z", true);
    await act("CALL", "Call open", "2026-11-03T16:00:00.000Z", false);
    await act("TASK", "Follow-up done", "2026-11-03T10:00:00.000Z", true);
    await act("TASK", "Follow-up open", "2026-11-03T17:00:00.000Z", false);
    await act("TASK", "Old follow-up open", "2026-11-01T10:00:00.000Z", false);
    const oldDone = await act("TASK", "Old follow-up finished today", "2026-11-01T10:00:00.000Z", false);
    await raw.crmActivity.update({ where: { id: oldDone.id }, data: { completedAt: new Date("2026-11-03T11:00:00.000Z") } });
    // time tracked today
    await raw.timeEntry.create({ data: { nodeId: epicId, workspaceId: ws.id, userId: owner, minutes: 95, date: new Date("2026-11-03T00:00:00.000Z") } });

    const { plan } = await getMyDay(owner, ws.id, NOW);
    expect(plan.tasks).toEqual({ planned: 3, done: 1 });
    expect(plan.meetings).toEqual({ planned: 4, done: 2 }); // Stand-up held + Call done
    expect(plan.followUps).toEqual({ planned: 2, done: 1 });
    expect(plan.backlogOpen).toBe(2); // "Late, open" and "Old follow-up open"
    expect(plan.backlogCleared).toBe(2); // "Late, finished today" and "Old follow-up finished today"
    expect(plan).toMatchObject({ planned: 9, done: 4, efficiency: 44, trackedMinutes: 95 });
    expect(plan.productivity).toBe(Math.round(((4 + 2) / (9 + 2 + 2)) * 100)); // 46
  });

  it("lists, for the drill-down, exactly the items the numbers are about", async () => {
    const d = await getMyDay(owner, ws.id, NOW);
    expect(d.tasks.today.map((t) => t.title).sort()).toEqual(["Open A", "Open B"]);
    expect(d.tasks.overdue.map((t) => t.title)).toEqual(["Late, open"]);
    expect(d.events.map((e) => e.title)).toEqual(["Stand-up", "Review"]);
    expect(d.scheduled.map((s) => s.subject)).toEqual(["Call open"]);
    expect(d.scheduled[0]).toMatchObject({ contactId: expect.any(String), companyId: null }); // so the row can link to the contact
    expect(d.crmTasks.map((s) => s.subject).sort()).toEqual(["Follow-up open", "Old follow-up open"]);
  });

  it("uses the person's own day: in Auckland it is already 4 November, and last night's stand-up belongs to the 3rd", async () => {
    await raw.user.update({ where: { id: owner }, data: { timezone: "Pacific/Auckland" } });
    try {
      await transact(owner, (ctx) => createNode(ctx, { parentId: projectId, type: "EVENT", title: "Auckland breakfast", data: { startsAt: "2026-11-03T13:30:00.000Z", endsAt: "2026-11-03T14:00:00.000Z", attendeeIds: [owner] } }));
      await task("Due 4 Nov", "2026-11-04T00:00:00.000Z");
      const d = await getMyDay(owner, ws.id, NOW);
      expect(d.date).toBe("2026-11-04");
      expect(d.timeZone).toBe("Pacific/Auckland");
      // 13:30Z is 02:30 and 15:00Z is 04:00 on the 4th; 09:00Z (the stand-up) was 22:00 on the 3rd.
      expect(d.events.map((e) => e.title)).toEqual(["Auckland breakfast", "Review"]);
      expect(d.tasks.today.map((t) => t.title)).toEqual(["Due 4 Nov"]);
      expect(d.tasks.overdue.map((t) => t.title).sort()).toEqual(["Late, open", "Open A", "Open B"]); // what was due on the 3rd is late there
    } finally {
      await raw.user.update({ where: { id: owner }, data: { timezone: "UTC" } });
    }
  });

  it("a guest only sees their own reachable projects, so their plan is empty", async () => {
    await raw.membership.create({ data: { userId: guest, workspaceId: ws.id, role: "GUEST" } });
    const d = await getMyDay(guest, ws.id, NOW);
    expect(d.plan).toMatchObject({ planned: 0, done: 0, efficiency: null });
  });
});

describe("My tasks", () => {
  it("sorts the to-do list into overdue, today, next seven days, later and done", async () => {
    await task("Next week", "2026-11-08T00:00:00.000Z");
    await task("Far away", "2026-12-24T00:00:00.000Z");
    await task("No date", null);
    const l = await listMyTasks(owner, ws.id, NOW);
    expect(l.overdue.map((t) => t.title)).toEqual(["Late, open"]);
    expect(l.today.map((t) => t.title).sort()).toEqual(["Open A", "Open B"]);
    expect(l.upcoming.map((t) => t.title)).toEqual(["Due 4 Nov", "Next week"]); // by date: tomorrow first
    expect(l.later.map((t) => t.title).sort()).toEqual(["Far away", "No date"]);
    expect(l.done.map((t) => t.title)).toEqual(expect.arrayContaining(["Done today", "Late, finished today"]));
    expect(l.done.map((t) => t.title)).not.toContain("Dropped");
    expect(l.overdue[0]).toMatchObject({ projectId, projectTitle: "Launch", status: "TODO" });
  });

  it("shows only the tasks of the person who asks", async () => {
    const l = await listMyTasks(guest, ws.id, NOW);
    expect([...l.overdue, ...l.today, ...l.upcoming, ...l.later, ...l.done]).toHaveLength(0);
  });
});
