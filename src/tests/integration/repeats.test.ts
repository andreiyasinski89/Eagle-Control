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
import { createNode, createProject, patchNode, transact } from "@/server/services/nodes/ops";
import { getTree } from "@/server/services/nodes/queries";
import { calendarQuerySchema, workspaceCalendar } from "@/server/services/nodes/views";
import { mergeRepeats, projectRepeats } from "@/server/services/nodes/repeats";
import { getMyDay } from "@/server/services/crm/my-day";
import { zonedParts } from "@/modules/views/tz";

let close: () => Promise<void>;
let owner: string;
let stranger: string;
let ws: { id: string; slug: string };
let projectId: string;
let eventIds: string[];
let loneId: string;
const TZ = "Europe/Warsaw";
const DATES = ["2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30", "2026-11-06", "2026-11-13"];
const q = (over: Record<string, string> = {}) => calendarQuerySchema.parse({ from: "2026-10-01", to: "2026-11-30", ...over });
// 19:00-20:30 in Warsaw: UTC+2 until 25 Oct, UTC+1 after.
const at = (d: string, h: number, m = 0) => {
  const offset = d < "2026-10-25" ? 2 : 1;
  return new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8), h - offset, m)).toISOString();
};

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://x";
  process.env.AUTH_SECRET ??= "x";
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner", timezone: TZ } })).id;
  stranger = (await t.db.user.create({ data: { email: "s@x.io" } })).id;
  ws = await createWorkspace(owner, "Acme");
  const { project } = await createProject(owner, ws.id, { name: "GOLD", template: "empty" });
  projectId = project.id;
  const make = async (title: string, d: string, h: number, endH: number) => {
    const id = (await transact(owner, (ctx) => createNode(ctx, { parentId: projectId, type: "EVENT", title }))).result.id;
    await transact(owner, (ctx) => patchNode(ctx, id, { data: { startsAt: at(d, h), endsAt: at(d, endH, 30), attendeeIds: [owner] } }));
    return id;
  };
  eventIds = [];
  for (const d of DATES) eventIds.push(await make("MWR Life презентация", d, 19, 20));
  loneId = await make("Разовая встреча", "2026-11-10", 12, 13);
}, 120_000);
afterAll(async () => close?.());

describe("repeating events", () => {
  it("finds the events that are one series, and only for someone who can change the project", async () => {
    const { series } = await projectRepeats(owner, projectId);
    expect(series).toEqual([{ keepId: eventIds[0], title: "MWR Life презентация", count: 6, extra: 5, first: "2026-10-09", last: "2026-11-13", time: "19:00", freq: "WEEKLY", interval: 1, skipped: 0 }]);
    await expect(projectRepeats(stranger, projectId)).rejects.toMatchObject({ status: 404 });
  });

  it("merges only what is really a series: a made-up id changes nothing", async () => {
    expect(await mergeRepeats(owner, projectId, [loneId, "nope"])).toEqual({ merged: 0, archived: 0 });
    expect((await getTree(owner, projectId)).nodes.filter((n) => n.type === "EVENT")).toHaveLength(7);
  });

  it("merges the series: one event stays and carries the rule, the copies are archived and can be restored", async () => {
    expect(await mergeRepeats(owner, projectId, [eventIds[0] as string])).toEqual({ merged: 1, archived: 5 });
    const events = (await getTree(owner, projectId)).nodes.filter((n) => n.type === "EVENT");
    expect(events.map((e) => e.id).sort()).toEqual([eventIds[0], loneId].sort());
    const kept = events.find((e) => e.id === eventIds[0]);
    expect(kept?.event?.repeat).toMatchObject({ freq: "WEEKLY", interval: 1, until: "2026-11-13", tz: TZ });
    expect(events.find((e) => e.id === loneId)?.event?.repeat).toBeUndefined();
    const archived = await holder.db.node.count({ where: { id: { in: eventIds.slice(1) }, archivedAt: { not: null } } });
    expect(archived).toBe(5);
    // nothing left to merge
    expect((await projectRepeats(owner, projectId)).series).toEqual([]);
  });

  it("the calendar shows every date of the series, each at 19:00 on the wall clock, and still the single meeting", async () => {
    const { items } = await workspaceCalendar(owner, ws.id, q());
    const pres = items.filter((i) => i.title === "MWR Life презентация");
    expect(pres.map((i) => zonedParts(i.at, TZ).day)).toEqual(DATES);
    for (const i of pres) {
      expect(zonedParts(i.at, TZ).time).toBe("19:00");
      expect(i.seriesId).toBe(eventIds[0]);
      expect(i.id.startsWith(`${eventIds[0]}@`)).toBe(true);
      expect(i.endAt && new Date(i.endAt).getTime() - new Date(i.at).getTime()).toBe(90 * 60_000);
    }
    expect(new Set(pres.map((i) => i.id)).size).toBe(6);
    const lone = items.filter((i) => i.title === "Разовая встреча");
    expect(lone).toHaveLength(1);
    expect(lone[0]?.seriesId).toBeUndefined();
    // a window before the first date or after the last has none
    expect((await workspaceCalendar(owner, ws.id, q({ from: "2026-11-14", to: "2026-11-30" }))).items.filter((i) => i.title === "MWR Life презентация")).toEqual([]);
  });

  it("a skipped date drops out of the calendar and an end date cuts the series", async () => {
    const data = (await holder.db.node.findUniqueOrThrow({ where: { id: eventIds[0] as string } })).data as Record<string, unknown>;
    const repeat = data.repeat as Record<string, unknown>;
    await transact(owner, (ctx) => patchNode(ctx, eventIds[0] as string, { data: { ...data, repeat: { ...repeat, skip: ["2026-10-30"], until: "2026-11-06" } } }));
    const days = (await workspaceCalendar(owner, ws.id, q())).items.filter((i) => i.title === "MWR Life презентация").map((i) => zonedParts(i.at, TZ).day);
    expect(days).toEqual(["2026-10-09", "2026-10-16", "2026-10-23", "2026-11-06"]);
  });

  it("My day lists the series on its day and not on the others", async () => {
    const friday = await getMyDay(owner, ws.id, new Date(at("2026-11-06", 10)));
    expect(friday.events.map((e) => e.title)).toContain("MWR Life презентация");
    expect(friday.events.find((e) => e.title === "MWR Life презентация")?.startsAt).toBe(at("2026-11-06", 19));
    const saturday = await getMyDay(owner, ws.id, new Date(at("2026-11-07", 10)));
    expect(saturday.events.map((e) => e.title)).not.toContain("MWR Life презентация");
    const skipped = await getMyDay(owner, ws.id, new Date(at("2026-10-30", 10)));
    expect(skipped.events.map((e) => e.title)).not.toContain("MWR Life презентация");
  });
});
