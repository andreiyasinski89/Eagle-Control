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
import { getTouchQueue } from "@/server/services/crm/touch-queue";
import { getTeamTree } from "@/server/services/crm/team-tree";
import { getMyDay } from "@/server/services/crm/my-day";
import { listPeople, listPeopleSchema } from "@/server/services/crm/people";

/**
 * The numbers the team was promised: the touch queue opens in under a second with 1000 people, and the team map copes with 300 partners.
 * They are measured on the in-process test database (PGlite), which is slower than a real Postgres, so passing here is a safe bet.
 */
let close: () => Promise<void>;
let owner: string;
let ws: { id: string };
const NOW = new Date("2026-11-10T12:00:00.000Z");
const DAY = 86_400_000;

async function timed<T>(fn: () => Promise<T>): Promise<{ ms: number; out: T }> {
  const t0 = performance.now();
  const out = await fn();
  return { ms: Math.round(performance.now() - t0), out };
}

beforeAll(async () => {
  const t = await createTestDb();
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Лидер", timezone: "UTC", locale: "ru" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO", contactPrivacy: "OPEN" } });
  await t.db.script.create({ data: { workspaceId: ws.id, title: "Первое касание", body: "Привет, {name}!", stage: "NEW", situation: "FIRST_TOUCH" } });

  // 1000 people through plain inserts (the service would take minutes): a node and a contact each, a third of them due today or late.
  const nodes = Array.from({ length: 1000 }, (_, i) => ({ id: `perf-n${i}`, workspaceId: ws.id, type: "CONTACT" as const, title: `Person ${i}`, createdById: owner, position: i }));
  await t.db.node.createMany({ data: nodes });
  await t.db.contact.createMany({
    data: nodes.map((n, i) => ({
      nodeId: n.id,
      workspaceId: ws.id,
      ownerId: owner,
      firstName: `Person${i}`,
      stage: (["NEW", "FIRST_CONTACT", "WARMING", "PRESENTATION", "DECIDING"] as const)[i % 5],
      temperature: (["HOT", "WARM", "COLD"] as const)[i % 3],
      nextStep: "Write",
      nextStepAt: new Date(NOW.getTime() + ((i % 3) - 1) * DAY),
      phones: [`+48600${String(i).padStart(6, "0")}`],
      phonesNorm: [String(i).padStart(9, "0")],
      messengers: i % 2 ? { telegram: `@p${i}` } : {},
    })),
  });
  // 300 partners: a tree three to five levels deep, each with a little work behind them.
  const pn = Array.from({ length: 300 }, (_, i) => ({ id: `perf-p${i}`, workspaceId: ws.id, type: "CONTACT" as const, title: `Partner ${i}`, createdById: owner, position: 2000 + i }));
  await t.db.node.createMany({ data: pn });
  await t.db.contact.createMany({
    data: pn.map((n, i) => ({
      nodeId: n.id,
      workspaceId: ws.id,
      ownerId: owner,
      firstName: `Partner${i}`,
      stage: "PARTNER" as const,
      sponsorId: i === 0 ? null : `perf-p${Math.floor((i - 1) / 3)}`,
      city: ["Warsaw", "Krakow", "Kyiv"][i % 3] ?? null,
      stageChangedAt: new Date(NOW.getTime() - (i + 5) * DAY),
      lastContactedAt: new Date(NOW.getTime() - (i % 9) * DAY),
    })),
  });
  await t.db.node.create({ data: { id: "perf-self", workspaceId: ws.id, type: "CONTACT", title: "Me", createdById: owner, position: 1 } });
  await t.db.contact.create({ data: { nodeId: "perf-self", workspaceId: ws.id, ownerId: owner, linkedUserId: owner, firstName: "Me", stage: "PARTNER" } });
  await t.db.contact.update({ where: { nodeId: "perf-p0" }, data: { sponsorId: "perf-self" } });
  // some finished calls so that the partners have a last sign of work
  await t.db.crmActivity.createMany({ data: Array.from({ length: 300 }, (_, i) => ({ workspaceId: ws.id, type: "CALL" as const, subject: "c", ownerId: owner, contactId: `perf-n${i}`, completedAt: new Date(NOW.getTime() - (i % 20) * DAY) })) });
  await t.db.contact.updateMany({ where: { nodeId: { in: Array.from({ length: 100 }, (_, i) => `perf-n${i}`) } }, data: { heldById: "perf-p1" } });
}, 120_000);
afterAll(async () => close());

describe("speed", () => {
  it("opens the touch queue in under a second with 1000 people", async () => {
    await getTouchQueue(owner, ws.id, NOW); // the first call warms the connection
    const { ms, out } = await timed(() => getTouchQueue(owner, ws.id, NOW));
    console.log(`touch queue, 1000 people: ${ms} ms, ${out.items.length} cards`);
    expect(out.items.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1000);
  });

  it("builds the team tree for 300 partners (three levels, then a branch) quickly", async () => {
    const first = await timed(() => getTeamTree(owner, ws.id, { depth: 3 }, NOW));
    console.log(`team tree, 300 partners, 3 levels: ${first.ms} ms, ${first.out.nodes.length} nodes`);
    expect(first.out.nodes.length).toBeGreaterThan(10);
    expect(first.ms).toBeLessThan(1500);
    const deep = await timed(() => getTeamTree(owner, ws.id, { depth: 6 }, NOW));
    console.log(`team tree, 300 partners, 6 levels: ${deep.ms} ms, ${deep.out.nodes.length} nodes`);
    expect(deep.out.nodes.length).toBe(300);
    expect(deep.ms).toBeLessThan(3000);
  });

  it("keeps My day and the people board fast with the same data", async () => {
    const day = await timed(() => getMyDay(owner, ws.id, NOW));
    const people = await timed(() => listPeople(owner, ws.id, listPeopleSchema.parse({}), NOW));
    console.log(`my day: ${day.ms} ms; people board: ${people.ms} ms`);
    expect(day.ms).toBeLessThan(2000);
    expect(people.ms).toBeLessThan(2000);
  });
});
