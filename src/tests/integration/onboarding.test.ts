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
import { createNode, createProject, transact } from "@/server/services/nodes/ops";
import { getTree } from "@/server/services/nodes/queries";
import { createContact, updateContact } from "@/server/services/crm/contacts";
import { createScript } from "@/server/services/crm/scripts";
import { saveRules } from "@/server/services/crm/stage-rules";
import { completeStep, saveGoals } from "@/server/services/crm/tracker";
import { createNote, createNoteSchema } from "@/server/services/notes";
import { getOnboarding, goalSchema, hideSchema, saveGoal, setHidden, setStepSkipped, skipSchema } from "@/server/services/onboarding";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let plain: string;
let outsider: string;
let ws: { id: string };

const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };
const status = async (userId: string, step: string) => (await getOnboarding(userId, ws.id)).steps.find((s) => s.id === step)?.status;

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://x";
  process.env.AUTH_SECRET ??= "x";
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  plain = (await t.db.user.create({ data: { email: "p@x.io", name: "Plain" } })).id;
  outsider = (await t.db.user.create({ data: { email: "z@x.io", name: "Zed" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await createWorkspace(outsider, "Other");
  await t.db.membership.create({ data: { userId: plain, workspaceId: ws.id, role: "MEMBER", crmAccess: false } });
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
}, 120_000);
afterAll(async () => close?.());

describe("getting started", () => {
  it("a new person has everything still to do, the platform first", async () => {
    const o = await getOnboarding(owner, ws.id);
    expect(o).toMatchObject({ crm: true, hidden: false, done: 0, percent: 0, next: "profile" });
    expect(o.steps.slice(0, 4).map((s) => s.id)).toEqual(["profile", "firstTask", "timer", "notes"]);
    expect(o.steps.every((s) => s.status === "todo")).toBe(true);
  });

  it("the platform steps are done by what the person did", async () => {
    await raw.user.update({ where: { id: owner }, data: { timezone: "Europe/Warsaw" } });
    const { project } = await createProject(owner, ws.id, { name: "Work", template: "agile-sprint-map" });
    const sprint = (await getTree(owner, project.id)).nodes.find((n) => n.type === "SPRINT")!;
    await transact(owner, (ctx) => createNode(ctx, { parentId: sprint.id, type: "TASK", title: "First" }));
    await raw.timeEntry.create({ data: { workspaceId: ws.id, userId: owner, minutes: 30, date: new Date("2026-10-27T00:00:00.000Z"), label: "x" } });
    await createNote(owner, ws.id, createNoteSchema.parse({ title: "Idea" }));
    for (const s of ["profile", "firstTask", "timer", "notes"]) expect(await status(owner, s), s).toBe("done");
    expect(await status(owner, "dream")).toBe("todo");
  });

  it("the dream, the targets and the distance to them", async () => {
    await saveGoal(owner, ws.id, goalSchema.parse({ dream: "A house by the sea", why: "For my family", targetDate: "2027-12-31", targetClients: 10, targetPartners: 4 }));
    const o = await getOnboarding(owner, ws.id);
    expect(o.goal).toEqual({ dream: "A house by the sea", why: "For my family", targetDate: "2027-12-31", targetClients: 10, targetPartners: 4 });
    expect(await status(owner, "dream")).toBe("done");
    expect(o.distance).toMatchObject({ clients: { have: 0, target: 10, left: 10 }, partners: { have: 0, target: 4, left: 4 }, percent: 0 });
    expect(o.distance.daysLeft).toBeGreaterThan(0);
    // wins move the distance: a client and a partner of mine
    const c = (await createContact(owner, ws.id, { ...base, firstName: "Anna", stage: "CLIENT" })).id;
    await createContact(owner, ws.id, { ...base, firstName: "Boris", stage: "PARTNER" });
    expect(c).toBeTruthy();
    const after = await getOnboarding(owner, ws.id);
    expect(after.distance).toMatchObject({ clients: { have: 1, left: 9 }, partners: { have: 1, left: 3 }, percent: 14 });
    await expect(saveGoal(owner, ws.id, goalSchema.parse({ dream: "x", why: "", targetDate: null, targetClients: null, targetPartners: null }))).resolves.toBeTruthy();
    expect(goalSchema.safeParse({ dream: "x", why: "", targetDate: "not a date", targetClients: null, targetPartners: null }).success).toBe(false);
    expect(goalSchema.safeParse({ dream: "x", why: "", targetDate: null, targetClients: -1, targetPartners: null }).success).toBe(false);
    await saveGoal(owner, ws.id, goalSchema.parse({ dream: "A house by the sea", why: "", targetDate: null, targetClients: 10, targetPartners: 4 }));
  });

  it("the work with people: the list, the funnel, next steps, scripts and auto-plans, the week's targets, the first day", async () => {
    for (let i = 0; i < 25; i++) await createContact(owner, ws.id, { ...base, firstName: `Person${i}` });
    expect(await status(owner, "list")).toBe("done");
    const o = await getOnboarding(owner, ws.id);
    expect(o.steps.find((s) => s.id === "list")?.progress).toEqual({ value: 27, goal: 100 });
    expect(await status(owner, "funnel")).toBe("todo");
    const ids = (await raw.contact.findMany({ where: { workspaceId: ws.id, firstName: { startsWith: "Person" } }, select: { nodeId: true }, take: 5 })).map((c) => c.nodeId);
    for (const id of ids) await updateContact(owner, id, { stage: "WARMING", nextStep: "Call", nextStepAt: "2026-11-05T00:00:00.000Z" });
    expect(await status(owner, "funnel")).toBe("done");
    expect(await status(owner, "nextSteps")).toBe("done");
    await createScript(owner, ws.id, { title: "Hi", stage: null, body: "Hi {name}" });
    expect(await status(owner, "scripts")).toBe("todo");
    await saveRules(owner, ws.id, { rules: [{ stage: "PRESENTATION", nextStep: "Ask", afterDays: 1 }] });
    expect(await status(owner, "scripts")).toBe("done");
    expect(await status(owner, "weekGoals")).toBe("todo");
    await saveGoals(owner, ws.id, { goals: { contacted: 10 } });
    expect(await status(owner, "weekGoals")).toBe("done");
    for (const id of ids.slice(0, 2)) await completeStep(owner, id, {});
    expect(await status(owner, "firstDay")).toBe("todo");
    await completeStep(owner, ids[2] as string, { afterDays: 2 });
    expect(await status(owner, "firstDay")).toBe("done");
    expect(await status(owner, "partners")).toBe("done");
    expect(await status(owner, "groups")).toBe("todo");
  });

  it("a step can be set aside and taken back, and the list can be put away", async () => {
    await setStepSkipped(owner, ws.id, skipSchema.parse({ step: "groups", skipped: true }));
    expect(await status(owner, "groups")).toBe("skipped");
    await setStepSkipped(owner, ws.id, skipSchema.parse({ step: "groups", skipped: false }));
    expect(await status(owner, "groups")).toBe("todo");
    expect(skipSchema.safeParse({ step: "nonsense", skipped: true }).success).toBe(false);
    await setHidden(owner, ws.id, hideSchema.parse({ hidden: true }));
    expect((await getOnboarding(owner, ws.id)).hidden).toBe(true);
    await setHidden(owner, ws.id, hideSchema.parse({ hidden: false }));
    expect((await getOnboarding(owner, ws.id)).hidden).toBe(false);
  });

  it("someone without the CRM sees only the steps they can take, and nobody sees another person's progress or workspace", async () => {
    const o = await getOnboarding(plain, ws.id);
    expect(o.crm).toBe(false);
    expect(o.steps.map((s) => s.id)).toEqual(["profile", "firstTask", "timer", "notes", "dream"]);
    expect(o.goal.dream).toBe("");
    await expect(getOnboarding(outsider, ws.id)).rejects.toBeTruthy();
    await expect(saveGoal(outsider, ws.id, goalSchema.parse({ dream: "x", why: "", targetDate: null, targetClients: null, targetPartners: null }))).rejects.toBeTruthy();
  });
});
