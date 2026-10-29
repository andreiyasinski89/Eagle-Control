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
import { getRankTracker, saveRankPlan, saveRankState } from "@/server/services/crm/rank-tracker";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let member: string;
let ws: { id: string };
const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };
const NOW = new Date("2026-11-10T12:00:00.000Z");
const make = async (name: string, data: Record<string, unknown>) => {
  const id = (await createContact(owner, ws.id, { ...base, firstName: name })).id;
  await raw.contact.update({ where: { nodeId: id }, data });
  return id;
};
const plan = {
  ranks: [
    { name: "Silver", criteria: [{ label: "Clients", target: 4, auto: "clients" as const }] },
    {
      name: "Gold",
      criteria: [
        { label: "First line", target: 4, auto: "partnersFirstLine" as const },
        { label: "Team", target: 10, auto: "teamSize" as const },
        { label: "New this month", target: 2, auto: "invitesMonth" as const },
        { label: "Volume", target: 1000, auto: null },
      ],
    },
  ],
};

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Лидер", timezone: "UTC" } })).id;
  member = (await t.db.user.create({ data: { email: "m@x.io", name: "Member" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO", contactPrivacy: "OPEN" } });
  await t.db.membership.create({ data: { userId: member, workspaceId: ws.id, role: "MEMBER", crmAccess: true, crmScope: "OWN" } });
  const me = await make("Me", { stage: "PARTNER", linkedUserId: owner, ownerId: owner });
  const a = await make("A", { stage: "PARTNER", sponsorId: me, stageChangedAt: new Date("2026-11-03T00:00:00Z") });
  await make("B", { stage: "PARTNER", sponsorId: me, stageChangedAt: new Date("2026-09-03T00:00:00Z") });
  const c = await make("C", { stage: "PARTNER", sponsorId: a, stageChangedAt: new Date("2026-11-04T00:00:00Z") });
  await make("D", { stage: "PARTNER", sponsorId: c });
  await make("Client1", { stage: "CLIENT" });
  await make("Client2", { stage: "CLIENT" });
});
afterAll(async () => close());

describe("rank tracker", () => {
  it("is empty until the leaders write a ladder, and only a leader writes it", async () => {
    const r = await getRankTracker(owner, ws.id, NOW);
    expect(r.ranks).toEqual([]);
    expect(r.status.next).toBeNull();
    await expect(saveRankPlan(member, ws.id, plan)).rejects.toMatchObject({ status: 403 });
    expect((await getRankTracker(member, ws.id, NOW)).canChange).toBe(false);
  });

  it("counts clients, the first line, the whole line and this month's invitations from the team", async () => {
    await saveRankPlan(owner, ws.id, plan);
    const r = await getRankTracker(owner, ws.id, NOW);
    expect(r.auto).toEqual({ clients: 2, partnersFirstLine: 2, teamSize: 4, invitesMonth: 1 });
    expect(r.status.next?.name).toBe("Silver");
    expect(r.status.criteria[0]).toMatchObject({ value: 2, percent: 50 });
  });

  it("keeps each person's own rank, target day and hand-counted values", async () => {
    const r = await saveRankState(owner, ws.id, { currentRankId: (await getRankTracker(owner, ws.id, NOW)).ranks[0]!.id, targetDate: "2026-11-20" }, NOW);
    expect(r.status.current?.name).toBe("Silver");
    expect(r.status.next?.name).toBe("Gold");
    expect(r.status.daysLeft).toBe(10);
    const volume = r.ranks[1]!.criteria[3]!;
    const r2 = await saveRankState(owner, ws.id, { manual: { [volume.id]: 400 } }, NOW);
    expect(r2.status.criteria.find((c) => c.label === "Volume")).toMatchObject({ value: 400, percent: 40, updatedAt: NOW.toISOString(), left: 600, perDay: 60 });
    // somebody else's state is their own
    expect((await getRankTracker(member, ws.id, NOW)).status.current).toBeNull();
  });

  it("refuses a rank that is not on the ladder and a criterion that is counted by the platform", async () => {
    await expect(saveRankState(owner, ws.id, { currentRankId: "nope" })).rejects.toMatchObject({ code: "invalid_rank" });
    const r = await getRankTracker(owner, ws.id, NOW);
    await expect(saveRankState(owner, ws.id, { manual: { [r.ranks[0]!.criteria[0]!.id]: 3 } })).rejects.toMatchObject({ code: "invalid_criterion" });
  });

  it("a member without a partner card has no team numbers", async () => {
    const r = await getRankTracker(member, ws.id, NOW);
    expect(r.auto).toMatchObject({ partnersFirstLine: 0, teamSize: 0, invitesMonth: 0 });
  });
});
