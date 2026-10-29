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
import { getMyOnboarding, getOnboardingPlan, getPartnerOnboarding, saveOnboardingPlan, startOnboarding } from "@/server/services/crm/partner-onboarding";
import { getTeamTree } from "@/server/services/crm/team-tree";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let newbie: string;
let ws: { id: string };
let me: string;
let anna: string;
let offline: string;
const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };

const partner = async (name: string, data: Record<string, unknown>) => {
  const id = (await createContact(owner, ws.id, { ...base, firstName: name })).id;
  await raw.contact.update({ where: { nodeId: id }, data: { stage: "PARTNER", ...data } });
  return id;
};

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Лидер", timezone: "UTC" } })).id;
  newbie = (await t.db.user.create({ data: { email: "n@x.io", name: "Newbie" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO", contactPrivacy: "OPEN" } });
  await t.db.membership.create({ data: { userId: newbie, workspaceId: ws.id, role: "MEMBER", crmAccess: true, crmScope: "OWN" } });
  me = await partner("Me", { linkedUserId: owner, ownerId: owner });
  anna = await partner("Anna", { sponsorId: me, linkedUserId: newbie });
  offline = await partner("Offline", { sponsorId: me });
});
afterAll(async () => close());

describe("onboarding plan", () => {
  it("starts with the default plan in the asked language and is changed only by a leader", async () => {
    const p = await getOnboardingPlan(owner, ws.id, "en");
    expect(p).toMatchObject({ custom: false, canChange: true });
    expect(p.steps[0]?.title).toBe("Get to know the product");
    expect((await getOnboardingPlan(newbie, ws.id, "ru")).canChange).toBe(false);
    await expect(saveOnboardingPlan(newbie, ws.id, [{ title: "x", day: 0, days: 1, checkpoint: false }])).rejects.toMatchObject({ status: 403 });
  });
});

describe("starting the first 30 days", () => {
  it("needs an account and a partner, and not your own card", async () => {
    await expect(startOnboarding(owner, ws.id, offline, "ru")).rejects.toMatchObject({ code: "no_account" });
    await expect(startOnboarding(owner, ws.id, me, "ru")).rejects.toMatchObject({ code: "own_card" });
    const plain = (await createContact(owner, ws.id, { ...base, firstName: "Plain" })).id;
    await expect(startOnboarding(owner, ws.id, plain, "ru")).rejects.toMatchObject({ code: "not_partner" });
  });

  it("makes one project: the newcomer's steps for the newcomer, the checks for the mentor", async () => {
    const r = await startOnboarding(owner, ws.id, anna, "en");
    expect(r.created).toBe(true);
    const project = await raw.node.findUniqueOrThrow({ where: { id: r.projectId } });
    expect(project.title).toBe("First 30 days: Anna");
    expect((project.data as { onboardingFor: string }).onboardingFor).toBe(anna);
    const tasks = await raw.node.findMany({ where: { rootId: r.projectId, type: "TASK" }, orderBy: { position: "asc" } });
    expect(tasks.length).toBe(16); // 10 steps and 6 checks (two steps and four weekly reviews have a checkpoint)
    const mine = tasks.filter((t) => t.assigneeId === newbie);
    const mentor = tasks.filter((t) => t.assigneeId === owner);
    expect(mine.length + mentor.length).toBe(tasks.length);
    expect(mentor.every((t) => t.title.startsWith("Check with the newcomer"))).toBe(true);
    expect(mine.every((t) => !t.title.startsWith("Check with"))).toBe(true);
  });

  it("gives back the same project when started twice", async () => {
    const a = await startOnboarding(owner, ws.id, anna, "en");
    expect(a.created).toBe(false);
    expect(await raw.node.count({ where: { workspaceId: ws.id, type: "PROJECT" } })).toBe(1);
  });

  it("follows the tasks the newcomer finishes and shows on the team map", async () => {
    const mineTasks = await raw.node.findMany({ where: { assigneeId: newbie, type: "TASK" }, orderBy: { position: "asc" } });
    await raw.node.update({ where: { id: mineTasks[0]!.id }, data: { status: "DONE" } });
    const p = (await getPartnerOnboarding(owner, ws.id, anna)).progress!;
    expect(p).toMatchObject({ done: 1, total: mineTasks.length, finished: false });
    expect(p.next).toBe(mineTasks[1]!.title);
    expect((await getMyOnboarding(newbie, ws.id)).progress?.done).toBe(1);
    const tree = await getTeamTree(owner, ws.id, { depth: 3 });
    expect(tree.nodes.find((n) => n.id === anna)?.onboarding?.percent).toBe(p.percent);
    expect(tree.nodes.find((n) => n.id === offline)?.onboarding).toBeNull();
  });

  it("turns the partner red when the onboarding is older than a week and not finished", async () => {
    const now = new Date(Date.now() + 9 * 86_400_000);
    const tree = await getTeamTree(owner, ws.id, { depth: 3 }, now);
    expect(tree.nodes.find((n) => n.id === anna)?.heat).toBe("red");
  });

  it("uses the leader's own steps for the next onboardings", async () => {
    await saveOnboardingPlan(owner, ws.id, [{ title: "Only step", day: 0, days: 5, checkpoint: false }], "ru");
    const other = await partner("Other", { sponsorId: me, linkedUserId: newbie });
    const r = await startOnboarding(owner, ws.id, other, "ru");
    const tasks = await raw.node.findMany({ where: { rootId: r.projectId, type: "TASK" } });
    expect(tasks.map((t) => t.title)).toEqual(["Only step"]);
    await saveOnboardingPlan(owner, ws.id, null, "ru");
    expect((await getOnboardingPlan(owner, ws.id, "ru")).custom).toBe(false);
  });
});
