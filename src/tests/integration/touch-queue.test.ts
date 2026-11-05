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
import { getMyDay } from "@/server/services/crm/my-day";
import { getTouchQueue, getTouchSettings, recordTouchResult, saveTouchSettings, touchResultSchema, touchSettingsSchema, overdueSchema, resolveOverdue } from "@/server/services/crm/touch-queue";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let other: string;
let ws: { id: string };
const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };
// the person's day: 10 November 2026, noon UTC
const NOW = new Date("2026-11-10T12:00:00.000Z");
const day = (n: number, from = NOW) => new Date(from.getTime() + n * 86_400_000).toISOString().slice(0, 10);
const at = (d: string) => new Date(`${d}T00:00:00.000Z`);
const make = async (firstName: string, data: Record<string, unknown> = {}, by = owner) => {
  const id = (await createContact(by, ws.id, { ...base, firstName })).id;
  await raw.contact.update({ where: { nodeId: id }, data });
  return id;
};
const queue = async (now = NOW) => (await getTouchQueue(owner, ws.id, now)).items;
const names = async (now = NOW) => (await queue(now)).map((i) => i.firstName);
const card = (id: string) => raw.contact.findUniqueOrThrow({ where: { nodeId: id } });
const ids: Record<string, string> = {};

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Андрей Тестов", timezone: "UTC" } })).id;
  other = (await t.db.user.create({ data: { email: "p@x.io", name: "Other" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  await t.db.membership.create({ data: { userId: other, workspaceId: ws.id, role: "MEMBER", crmAccess: true, crmScope: "OWN" } });
  ids.hot = await make("Hot", { stage: "WARMING", temperature: "HOT", nextStepAt: at(day(-1)), nextStep: "Call", messengers: { telegram: "@hot_user" }, phones: ["+48 600 111 222"] });
  ids.today = await make("Today", { stage: "NEW", temperature: "COLD", nextStepAt: at(day(0)), nextStep: "Write" });
  ids.future = await make("Future", { nextStepAt: at(day(3)) });
  ids.back = await make("Back", { stage: "DECLINED", declineReason: "NO_TIME", returnAt: at(day(-1)), nextStepAt: at(day(-1)) });
  ids.oldNo = await make("OldNo", { stage: "DECLINED", nextStepAt: at(day(-40)) }); // an old date, but no day to come back: not in the queue
  ids.theirs = await make("Theirs", { nextStepAt: at(day(-1)) }, other);
}, 120_000);
afterAll(async () => close?.());

describe("the queue", () => {
  it("holds the people whose turn it is, late first, then the hottest, and not those of others, those not yet due or those out of the funnel", async () => {
    expect(await names()).toEqual(["Hot", "Back", "Today"]);
    const q = await getTouchQueue(owner, ws.id, NOW);
    expect(q).toMatchObject({ total: 3, date: "2026-11-10", truncated: false });
    expect(q.items.map((i) => [i.firstName, i.overdue])).toEqual([["Hot", true], ["Back", true], ["Today", false]]);
  });

  it("a card has what is needed to write: how to reach them, how they are, and what happened last", async () => {
    await raw.crmActivity.createMany({ data: [1, 2, 3, 4].map((n) => ({ workspaceId: ws.id, type: "MESSAGE" as const, subject: `Msg ${n}`, ownerId: owner, contactId: ids.hot as string, completedAt: new Date(NOW.getTime() - n * 86_400_000), dueAt: new Date(NOW.getTime() - n * 86_400_000), createdAt: new Date(NOW.getTime() - n * 86_400_000) })) });
    const hot = (await queue()).find((i) => i.firstName === "Hot")!;
    expect(hot).toMatchObject({ stage: "WARMING", temperature: "HOT", telegram: "hot_user", whatsapp: "48600111222", situation: "REMINDER" });
    expect(hot.recent.map((a) => a.subject)).toEqual(["Msg 1", "Msg 2", "Msg 3"]); // the last three
    const back = (await queue()).find((i) => i.firstName === "Back")!;
    expect(back.situation).toBe("RETURN");
    expect((await queue()).find((i) => i.firstName === "Today")?.situation).toBe("FIRST_TOUCH");
  });

  it("brings the scripts of the team and the person's own, the name and the personal link", async () => {
    await raw.script.createMany({ data: [
      { workspaceId: ws.id, title: "Team script", stage: "NEW", body: "Hi {имя}", ownerId: null },
      { workspaceId: ws.id, title: "My script", stage: "NEW", body: "Hello {name}", ownerId: owner },
      { workspaceId: ws.id, title: "Someone else's", stage: "NEW", body: "Secret", ownerId: other },
    ] });
    const q = await getTouchQueue(owner, ws.id, NOW);
    expect(q.scripts.map((s) => [s.title, s.shared]).sort()).toEqual([["My script", false], ["Team script", true]]);
    expect(q.me.name).toBe("Андрей");
    expect(q.me.link).toMatch(/^https:\/\/meetowl\.test\/r\/[A-Za-z0-9]+$/);
  });
});

describe("what a result does", () => {
  it("an answer: written in the feed, no date set (nobody comes back by themselves), a new name becomes a first contact, the person warms", async () => {
    const r = await recordTouchResult(owner, ids.today as string, { outcome: "REPLIED", message: "Hi, how are you?", channel: "telegram" }, NOW);
    expect(r).toMatchObject({ stage: "FIRST_CONTACT", nextStep: null, nextStepAt: null, cooled: false });
    const c = await card(ids.today as string);
    expect(c).toMatchObject({ stage: "FIRST_CONTACT", nextStep: null, nextStepAt: null, returnAt: null });
    expect(c.lastContactedAt?.toISOString()).toBe(NOW.toISOString());
    expect(c.temperature).toBe("WARM"); // 1 stage + a touch + a reply (2) = 3.5
    const touch = await raw.crmActivity.findUniqueOrThrow({ where: { id: r.activityId } });
    expect(touch).toMatchObject({ type: "MESSAGE", outcome: "REPLIED", body: "Hi, how are you?", contactId: ids.today });
    expect(await raw.contactStageEvent.count({ where: { contactNodeId: ids.today as string, fromStage: "NEW", toStage: "FIRST_CONTACT" } })).toBe(1);
    expect(await names()).not.toContain("Today"); // not due today any more
  });

  it("no answer: no date; the third one in a row and the person goes quiet and is back in 30 days", async () => {
    const id = await make("Quiet", { stage: "WARMING", nextStepAt: at(day(0)) });
    const one = await recordTouchResult(owner, id, { outcome: "NO_REPLY" }, NOW);
    expect(one).toMatchObject({ nextStepAt: null, nextStep: null, cooled: false, stage: "WARMING" });
    const two = await recordTouchResult(owner, id, { outcome: "NO_REPLY" }, new Date(NOW.getTime() + 3 * 86_400_000));
    expect(two).toMatchObject({ cooled: false, stage: "WARMING" });
    const three = await recordTouchResult(owner, id, { outcome: "NO_REPLY" }, new Date(NOW.getTime() + 6 * 86_400_000));
    expect(three).toMatchObject({ cooled: true, stage: "NO_REPLY", returnAt: day(30, new Date(NOW.getTime() + 6 * 86_400_000)) });
    const c = await card(id);
    expect(c).toMatchObject({ stage: "NO_REPLY", temperature: "COLD" });
    expect(c.returnAt?.toISOString().slice(0, 10)).toBe(day(36));
    expect(await names(new Date(NOW.getTime() + 20 * 86_400_000))).not.toContain("Quiet"); // out of the queue for now
    expect(await names(new Date(NOW.getTime() + 37 * 86_400_000))).toContain("Quiet"); // and back on its day
  });

  it("wrote and waiting: out of today's queue, no date, never counted as silence", async () => {
    const id = await make("Patient", { stage: "WARMING", nextStepAt: at(day(0)) });
    const r = await recordTouchResult(owner, id, { outcome: "WAITING", message: "Hi!" }, NOW);
    expect(r).toMatchObject({ outcome: "WAITING", stage: "WARMING", cooled: false, nextStepAt: null, nextStep: null, returnAt: null });
    expect(await raw.crmActivity.findFirstOrThrow({ where: { contactId: id, outcome: "WAITING" } })).toMatchObject({ type: "MESSAGE", subject: "Touch: wrote, waiting for an answer", body: "Hi!" });
    expect((await card(id)).lastContactedAt).toBeTruthy();
    // no date: not in the queue today, tomorrow or in a month
    for (const d of [0, 1, 2, 30]) expect(await names(new Date(NOW.getTime() + d * 86_400_000)), `day ${d}`).not.toContain("Patient");
    // three waits in a row do not make the person go quiet, and a wait between two silences does not end their run
    await recordTouchResult(owner, id, { outcome: "WAITING" }, new Date(NOW.getTime() + 2 * 86_400_000));
    expect((await recordTouchResult(owner, id, { outcome: "WAITING" }, new Date(NOW.getTime() + 4 * 86_400_000))).cooled).toBe(false);
    expect((await recordTouchResult(owner, id, { outcome: "NO_REPLY" }, new Date(NOW.getTime() + 6 * 86_400_000))).cooled).toBe(false);
  });

  it("\"write again in 7 / 14 days\": the person is out of the queue until that day, then back with the reminder script", async () => {
    const a = await make("Seven", { stage: "WARMING", nextStepAt: at(day(0)) });
    const b = await make("Fourteen", { stage: "WARMING", nextStepAt: at(day(0)) });
    const r7 = await recordTouchResult(owner, a, { outcome: "WAITING", nextInDays: 7 }, NOW);
    expect(r7).toMatchObject({ nextStepAt: `${day(7)}T00:00:00.000Z`, nextStep: "Write again", cooled: false, stage: "WARMING" });
    expect(await recordTouchResult(owner, b, { outcome: "WAITING", nextInDays: 14 }, NOW)).toMatchObject({ nextStepAt: `${day(14)}T00:00:00.000Z` });
    expect(await names(new Date(NOW.getTime() + 6 * 86_400_000))).not.toContain("Seven");
    const back7 = (await queue(new Date(NOW.getTime() + 7 * 86_400_000))).find((i) => i.firstName === "Seven");
    expect(back7).toMatchObject({ situation: "REMINDER", lastOutcome: "WAITING", nextStep: "Write again" });
    expect(await names(new Date(NOW.getTime() + 7 * 86_400_000))).not.toContain("Fourteen");
    expect(await names(new Date(NOW.getTime() + 14 * 86_400_000))).toContain("Fourteen");
    // an answer or a silence with the button pressed works the same
    const c = await make("Replied seven", { stage: "WARMING", nextStepAt: at(day(0)) });
    expect(await recordTouchResult(owner, c, { outcome: "REPLIED", nextInDays: 7 }, NOW)).toMatchObject({ nextStepAt: `${day(7)}T00:00:00.000Z` });
    // only 7 and 14 are accepted
    await expect(recordTouchResult(owner, c, { outcome: "WAITING", nextInDays: 3 as 7 }, NOW)).resolves.toBeTruthy(); // the service trusts the route's schema
    expect(touchResultSchema.safeParse({ outcome: "WAITING", nextInDays: 3 }).success).toBe(false);
    expect(touchResultSchema.safeParse({ outcome: "WAITING", nextInDays: 14 }).success).toBe(true);
  });

  it("an answer in between ends the run of unanswered touches", async () => {
    const id = await make("Streak", { stage: "WARMING", nextStepAt: at(day(0)) });
    await recordTouchResult(owner, id, { outcome: "NO_REPLY" }, NOW);
    await recordTouchResult(owner, id, { outcome: "NO_REPLY" }, new Date(NOW.getTime() + 1000));
    await recordTouchResult(owner, id, { outcome: "REPLIED" }, new Date(NOW.getTime() + 2000));
    expect((await recordTouchResult(owner, id, { outcome: "NO_REPLY" }, new Date(NOW.getTime() + 3000))).cooled).toBe(false);
  });

  it("a meeting set: it needs a time, goes into the calendar, moves the person on and makes its day the next step", async () => {
    const id = await make("Meet", { stage: "FIRST_CONTACT", nextStepAt: at(day(0)) });
    await expect(recordTouchResult(owner, id, { outcome: "MEETING_SET" }, NOW)).rejects.toMatchObject({ status: 422, code: "missing_meeting" });
    const when = `${day(2)}T15:00:00.000Z`;
    const r = await recordTouchResult(owner, id, { outcome: "MEETING_SET", meetingAt: when, durationMin: 45 }, NOW);
    expect(r).toMatchObject({ stage: "PRESENTATION", nextStepAt: `${day(2)}T00:00:00.000Z` });
    expect(r.nextStep).toContain(`${day(2).slice(8, 10)}.${day(2).slice(5, 7)}`);
    const meeting = await raw.crmActivity.findFirstOrThrow({ where: { contactId: id, type: "MEETING" } });
    expect(meeting).toMatchObject({ completedAt: null, durationMin: 45 });
    expect(meeting.dueAt?.toISOString()).toBe(when);
    expect((await card(id)).stage).toBe("PRESENTATION");
  });

  it("a no: it needs a reason, the person leaves the funnel's queue for 75 days and the reason is kept", async () => {
    const id = await make("Says no", { stage: "PRESENTATION", nextStepAt: at(day(0)) });
    await expect(recordTouchResult(owner, id, { outcome: "DECLINED" }, NOW)).rejects.toMatchObject({ status: 422, code: "missing_reason" });
    const r = await recordTouchResult(owner, id, { outcome: "DECLINED", declineReason: "DISTRUST_MLM" }, NOW);
    expect(r).toMatchObject({ stage: "DECLINED", returnAt: day(75) });
    expect(await card(id)).toMatchObject({ stage: "DECLINED", declineReason: "DISTRUST_MLM", temperature: "COLD" });
    expect(await names()).not.toContain("Says no");
    expect(await names(new Date(NOW.getTime() + 76 * 86_400_000))).toContain("Says no");
  });

  it("someone brought back by their day who answers is back in the funnel and out of the waiting list", async () => {
    const r = await recordTouchResult(owner, ids.back as string, { outcome: "REPLIED", message: "Hello again" }, NOW);
    expect(r.stage).toBe("FIRST_CONTACT");
    expect(await card(ids.back as string)).toMatchObject({ stage: "FIRST_CONTACT", returnAt: null, declineReason: null });
  });

  it("the words written down follow the language of the screen the person works in", async () => {
    const id = await make("Language", { stage: "WARMING", nextStepAt: at(day(0)) });
    const r = await recordTouchResult(owner, id, { outcome: "REPLIED", locale: "ru", nextInDays: 7 }, NOW);
    expect(r.nextStep).toBe("Написать снова");
    expect((await raw.crmActivity.findUniqueOrThrow({ where: { id: r.activityId } })).subject).toBe("Касание: ответил(а)");
    const pl = await recordTouchResult(owner, id, { outcome: "NO_REPLY", locale: "pl", nextInDays: 14 }, new Date(NOW.getTime() + 1000));
    expect(pl.nextStep).toBe("Napisać ponownie");
  });

  it("a person one may not see cannot be written about, and the queue never holds them", async () => {
    await expect(recordTouchResult(other, ids.hot as string, { outcome: "REPLIED" }, NOW)).rejects.toMatchObject({ status: 404 });
    expect(await names()).not.toContain("Theirs");
    expect((await getTouchQueue(other, ws.id, NOW)).items.map((i) => i.firstName)).toEqual(["Theirs"]);
  });
});

describe("the person's own settings", () => {
  it("start with the defaults, keep what is allowed, and change the next steps", async () => {
    expect(await getTouchSettings(owner, ws.id)).toEqual({ staleDays: 14, coolAfter: 3, coolDays: 30, declineDays: 75, meetingMovesStage: true });
    expect(await saveTouchSettings(owner, ws.id, { staleDays: 21, declineDays: 60, meetingMovesStage: false })).toMatchObject({ staleDays: 21, declineDays: 60, meetingMovesStage: false });
    expect(touchSettingsSchema.safeParse({ staleDays: 3, declineDays: 60, meetingMovesStage: true }).success).toBe(false);
    const a = await make("Custom", { stage: "FIRST_CONTACT", nextStepAt: at(day(0)) });
    expect(await recordTouchResult(owner, a, { outcome: "NO_REPLY" }, NOW)).toMatchObject({ nextStepAt: null });
    const b = await make("Custom meeting", { stage: "FIRST_CONTACT", nextStepAt: at(day(0)) });
    expect((await recordTouchResult(owner, b, { outcome: "MEETING_SET", meetingAt: `${day(1)}T10:00:00.000Z` }, NOW)).stage).toBe("FIRST_CONTACT"); // the rule is off
    const c = await make("Custom no", { stage: "WARMING", nextStepAt: at(day(0)) });
    expect(await recordTouchResult(owner, c, { outcome: "DECLINED", declineReason: "NO_TIME" }, NOW)).toMatchObject({ returnAt: day(60) });
    // the other person's settings are theirs
    expect(await getTouchSettings(other, ws.id)).toMatchObject({ staleDays: 14 });
  });
});

describe("the queue feeds the plan of the day", () => {
  it("a meeting set for today counts at once among the meetings of the day, and the touch among the follow-ups", async () => {
    const id = await make("Planned today", { stage: "FIRST_CONTACT", nextStepAt: at(day(0)) });
    const before = (await getMyDay(owner, ws.id, NOW)).plan;
    await recordTouchResult(owner, id, { outcome: "MEETING_SET", meetingAt: `${day(0)}T15:00:00.000Z` }, NOW);
    const after = (await getMyDay(owner, ws.id, NOW)).plan;
    expect(after.meetings).toEqual({ planned: before.meetings.planned + 1, done: before.meetings.done });
    expect(after.followUps.done).toBe(before.followUps.done + 1); // the touch itself is done work
  });
});

describe("people forgotten for long, and late dates", () => {
  it("the other list holds people with no date who have not been touched for the chosen days, and the count is beside the list of the day", async () => {
    await saveTouchSettings(owner, ws.id, { staleDays: 14, declineDays: 75, meetingMovesStage: true });
    const old = new Date(NOW.getTime() - 20 * 86_400_000);
    const lost = await make("Lost", { stage: "WARMING", nextStepAt: null, lastContactedAt: old });
    const fresh = await make("Fresh", { stage: "WARMING", nextStepAt: null, lastContactedAt: new Date(NOW.getTime() - 3 * 86_400_000) });
    const planned = await make("Planned", { stage: "WARMING", nextStepAt: at(day(5)), lastContactedAt: old });
    const resting = await make("Resting", { stage: "DECLINED", nextStepAt: null, lastContactedAt: old });
    const fresh1 = await make("NeverTouchedNew", { stage: "NEW", nextStepAt: null });
    void fresh; void planned; void resting; void fresh1;
    const due = await getTouchQueue(owner, ws.id, NOW);
    expect(due.mode).toBe("due");
    expect(due.staleCount).toBeGreaterThanOrEqual(1);
    const list = await getTouchQueue(owner, ws.id, NOW, "en", { stale: true });
    expect(list.mode).toBe("stale");
    const nm = list.items.map((i) => i.firstName);
    expect(nm).toContain("Lost");
    for (const no of ["Fresh", "Planned", "Resting", "NeverTouchedNew"]) expect(nm, no).not.toContain(no);
    expect(list.total).toBe(due.staleCount);
    // touching them takes them out of that list
    await recordTouchResult(owner, lost, { outcome: "WAITING" }, NOW);
    expect((await getTouchQueue(owner, ws.id, NOW, "en", { stale: true })).items.map((i) => i.firstName)).not.toContain("Lost");
  });

  it("late dates are counted, and sorted out in one go: dates taken off, or moved to 7 or 14 days; the rest is left alone", async () => {
    const late1 = await make("Late one", { stage: "WARMING", nextStepAt: at(day(-3)), nextStep: "Call back" });
    const late2 = await make("Late two", { stage: "DECIDING", nextStepAt: at(day(-10)) });
    const today = await make("Due today", { stage: "WARMING", nextStepAt: at(day(0)) });
    const future = await make("Due later", { stage: "WARMING", nextStepAt: at(day(4)) });
    const q = await getTouchQueue(owner, ws.id, NOW);
    expect(q.overdueCount).toBeGreaterThanOrEqual(2);
    const preview = await resolveOverdue(owner, ws.id, { mode: "clear", dryRun: true }, NOW);
    expect(preview.count).toBe(q.overdueCount);
    expect(preview.changed).toBe(0);
    expect((await card(late1)).nextStepAt).not.toBeNull(); // a preview changes nothing

    const r7 = await resolveOverdue(owner, ws.id, { mode: "in7" }, NOW);
    expect(r7.changed).toBe(q.overdueCount);
    expect((await card(late1)).nextStepAt?.toISOString()).toBe(`${day(7)}T00:00:00.000Z`);
    expect((await card(late1)).nextStep).toBe("Call back"); // the words stay, only the date changes
    expect((await card(late2)).nextStepAt?.toISOString()).toBe(`${day(7)}T00:00:00.000Z`);
    expect((await card(today)).nextStepAt?.toISOString()).toBe(`${day(0)}T00:00:00.000Z`);
    expect((await card(future)).nextStepAt?.toISOString()).toBe(`${day(4)}T00:00:00.000Z`);
    expect((await getTouchQueue(owner, ws.id, NOW)).overdueCount).toBe(0);

    // taken off
    await raw.contact.update({ where: { nodeId: late2 }, data: { nextStepAt: at(day(-2)) } });
    expect((await resolveOverdue(owner, ws.id, { mode: "clear" }, NOW)).changed).toBe(1);
    expect((await card(late2)).nextStepAt).toBeNull();
    expect(await resolveOverdue(owner, ws.id, { mode: "clear" }, NOW)).toEqual({ count: 0, changed: 0 });
    expect(overdueSchema.safeParse({ mode: "in3" }).success).toBe(false);
  });

  it("only the member's own people are touched: what another member owns stays as it is", async () => {
    await raw.contact.update({ where: { nodeId: ids.hot as string }, data: { nextStepAt: at(day(-4)) } });
    const theirs = await resolveOverdue(other, ws.id, { mode: "clear" }, NOW);
    expect(theirs.changed).toBeGreaterThanOrEqual(1);
    expect((await card(ids.theirs as string)).nextStepAt).toBeNull(); // the other member's own late date was taken off
    expect((await card(ids.hot as string)).nextStepAt?.toISOString()).toBe(`${day(-4)}T00:00:00.000Z`); // the owner's was not
  });
});

describe("My day and the queue agree", () => {
  it("someone whose day to come back has come is among the people due today, one with only an old date is not", async () => {
    await saveTouchSettings(owner, ws.id, { staleDays: 14, declineDays: 75, meetingMovesStage: true });
    const quiet = await make("Returns today", { stage: "NO_REPLY", returnAt: at(day(0)), nextStepAt: at(day(0)) });
    const day0 = await getMyDay(owner, ws.id, NOW);
    expect(day0.contactsDue.map((c) => c.name)).toContain("Returns today P".replace(" P", ""));
    expect(day0.contactsDue.map((c) => c.name)).not.toContain("OldNo");
    void quiet;
  });
});
