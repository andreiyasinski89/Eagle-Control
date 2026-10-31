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
import { transferContacts } from "@/server/services/crm/partners";
import { addStarterScripts, createScript, deleteScript, listScripts, updateScript } from "@/server/services/crm/scripts";
import { listRules, saveRules, saveRulesSchema } from "@/server/services/crm/stage-rules";
import { completeStep, getWeek, saveGoals } from "@/server/services/crm/tracker";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let outsider: string;
let ws: { id: string };

const base = { emails: [] as string[], phones: [] as string[], messengers: {}, allowDuplicate: false, consentGiven: false };
const person = async (firstName: string, extra: Record<string, unknown> = {}) => (await createContact(owner, ws.id, { ...base, firstName, ...extra })).id;
const day = (iso: Date | string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : null);
const today = () => new Date().toISOString().slice(0, 10);
const plus = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  outsider = (await t.db.user.create({ data: { email: "x@x.io", name: "Out" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await createWorkspace(outsider, "Other");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
}, 120_000);
afterAll(async () => close?.());

describe("scripts", () => {
  it("keeps texts for a moment in the funnel, changes them and removes them", async () => {
    const a = await createScript(owner, ws.id, { title: "First message", stage: "NEW", body: "Hi {name}!" });
    await createScript(owner, ws.id, { title: "Any time", stage: null, body: "Thanks" });
    expect((await listScripts(owner, ws.id)).items.map((s) => [s.title, s.stage])).toEqual([["First message", "NEW"], ["Any time", null]]);
    expect(await updateScript(owner, a.id, { stage: "WARMING", body: "Hello {name}" })).toMatchObject({ stage: "WARMING", body: "Hello {name}" });
    await deleteScript(owner, a.id);
    expect((await listScripts(owner, ws.id)).items).toHaveLength(1);
  });
  it("adds the ready-made set for every stage once, in the asked language, and only what is missing the next time", async () => {
    const before = (await listScripts(owner, ws.id)).items.length;
    const first = await addStarterScripts(owner, ws.id, "ru");
    expect(first.added).toBeGreaterThan(9);
    expect(first.skipped).toBe(0);
    const items = (await listScripts(owner, ws.id, "ru")).items;
    expect(items).toHaveLength(before + first.added);
    expect(items.some((s) => s.stage === "NO_REPLY" && /[а-я]/i.test(s.body))).toBe(true);
    // pressed again, or changed by hand: nothing is duplicated, and a deleted one comes back
    expect(await addStarterScripts(owner, ws.id, "ru")).toEqual({ added: 0, skipped: first.added });
    const gone = items.find((s) => s.stage === "DECLINED")!;
    await deleteScript(owner, gone.id);
    expect(await addStarterScripts(owner, ws.id, "ru")).toMatchObject({ added: 1 });
    // another language is the same set, shown in that language: nothing more is added
    expect((await addStarterScripts(owner, ws.id, "en")).added).toBe(0);
    await expect(addStarterScripts(outsider, ws.id, "ru")).rejects.toBeTruthy();
  });
  it("is closed to strangers", async () => {
    await expect(listScripts(outsider, ws.id)).rejects.toBeTruthy();
    await expect(createScript(outsider, ws.id, { title: "x", stage: null, body: "x" })).rejects.toBeTruthy();
    const s = (await listScripts(owner, ws.id)).items[0]!;
    await expect(updateScript(outsider, s.id, { title: "Hacked" })).rejects.toBeTruthy();
    await expect(deleteScript(outsider, s.id)).rejects.toBeTruthy();
  });
});

describe("auto-plans", () => {
  it("fill the next step when a person moves into a stage, but not over what the change says", async () => {
    await saveRules(owner, ws.id, { rules: [{ stage: "PRESENTATION", nextStep: "Ask what they thought", afterDays: 1 }, { stage: "DECIDING", nextStep: "Call for the decision", afterDays: 3 }, { stage: "CLIENT", nextStep: "", afterDays: 2 }] });
    expect((await listRules(owner, ws.id)).rules.map((r) => r.stage).sort()).toEqual(["DECIDING", "PRESENTATION"]);

    const a = await person("Anna");
    await updateContact(owner, a, { stage: "PRESENTATION" });
    expect(await getContact(owner, a)).toMatchObject({ nextStep: "Ask what they thought" });
    expect(day((await getContact(owner, a)).nextStepAt)).toBe(plus(1));

    const b = await person("Boris");
    await updateContact(owner, b, { stage: "DECIDING", nextStep: "My own step" });
    expect(await getContact(owner, b)).toMatchObject({ nextStep: "My own step", nextStepAt: null });

    const c = await person("Clara");
    await updateContact(owner, c, { stage: "CLIENT" });
    expect(await getContact(owner, c)).toMatchObject({ nextStep: null });

    await updateContact(owner, a, { stage: "PRESENTATION", temperature: "HOT" });
    expect(day((await getContact(owner, a)).nextStepAt)).toBe(plus(1));
  });
  it("one rule for each stage, and only members change them", async () => {
    expect(saveRulesSchema.safeParse({ rules: [{ stage: "NEW", nextStep: "a", afterDays: 1 }, { stage: "NEW", nextStep: "b", afterDays: 1 }] }).success).toBe(false);
    await expect(saveRules(outsider, ws.id, { rules: [] })).rejects.toBeTruthy();
    await saveRules(owner, ws.id, { rules: [] });
  });
});

describe("the week", () => {
  it("counts what the person did: added, reached, presentations, clients, partners, calls and meetings", async () => {
    await person("Dora", { stage: "FIRST_CONTACT" });
    const e = await person("Egor");
    await updateContact(owner, e, { stage: "FIRST_CONTACT" });
    await updateContact(owner, e, { stage: "PRESENTATION" });
    await updateContact(owner, e, { stage: "CLIENT" });
    const f = await person("Fedor", { stage: "PARTNER" });
    await raw.crmActivity.createMany({ data: [{ workspaceId: ws.id, type: "CALL", subject: "Call", ownerId: owner, completedAt: new Date() }, { workspaceId: ws.id, type: "MEETING", subject: "Meet", ownerId: owner, completedAt: new Date() }, { workspaceId: ws.id, type: "CALL", subject: "Planned", ownerId: owner }] });
    const w = await getWeek(owner, ws.id, { week: 0 });
    // Anna, Boris, Clara, Dora, Egor, Fedor were all added this week; Anna and Boris and Clara earlier moved to other stages
    expect(w.counts).toMatchObject({ added: 6, contacted: 2, presentations: 2, clients: 2, partners: 1, meetings: 2 });
    expect(w.from <= today() && today() <= w.to).toBe(true);
    expect(await getWeek(owner, ws.id, { week: -1 })).toMatchObject({ counts: { added: 0, contacted: 0, presentations: 0, clients: 0, partners: 0, meetings: 0 } });
    expect(f).toBeTruthy();
  });
  it("keeps the targets of each person and shows what each partner's people did", async () => {
    expect((await saveGoals(owner, ws.id, { goals: { contacted: 10, clients: 1 } })).goals).toEqual({ contacted: 10, clients: 1 });
    expect((await getWeek(owner, ws.id, { week: 0 })).goals).toEqual({ contacted: 10, clients: 1 });
    expect((await getWeek(outsider, ws.id, { week: 0 }).catch(() => "closed"))).toBe("closed");

    const partner = await person("Pavel", { stage: "PARTNER" });
    const g = await person("Galina");
    await transferContacts(owner, ws.id, { ids: [g], toPartnerId: partner });
    await updateContact(owner, g, { stage: "PRESENTATION" });
    const team = (await getWeek(owner, ws.id, { week: 0 })).team;
    expect(team).toEqual([expect.objectContaining({ name: "Pavel", presentations: 1, clients: 0 })]);
  });
});

describe("closing a step", () => {
  it("notes what was done, counts the person as touched, and moves the next step on or clears it", async () => {
    const id = await person("Hanna", { nextStep: "Call", nextStepAt: "2026-10-01T00:00:00.000Z" });
    const r = await completeStep(owner, id, { afterDays: 3, nextStep: "Send the video" });
    expect(day(r.nextStepAt)).toBe(plus(3));
    const c = await getContact(owner, id);
    expect(c).toMatchObject({ nextStep: "Send the video" });
    expect(c.lastContactedAt).toBeTruthy();
    expect((await raw.crmActivity.findMany({ where: { contactId: id, type: "NOTE" } })).map((n) => n.subject)).toContain("Done: Call");

    await completeStep(owner, id, { afterDays: 7 });
    expect(await getContact(owner, id)).toMatchObject({ nextStep: "Send the video" });
    await completeStep(owner, id, {});
    expect(await getContact(owner, id)).toMatchObject({ nextStep: null, nextStepAt: null });
    await expect(completeStep(owner, id, { nextStep: "x" })).rejects.toMatchObject({ code: "missing_date" });
    await expect(completeStep(outsider, id, {})).rejects.toBeTruthy();
  });
});
