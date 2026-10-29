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
import { addStarterScripts, copyScript, createScript, deleteScript, listScripts, updateScript } from "@/server/services/crm/scripts";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let anna: string;
let boris: string;
let ws: { id: string };
const titles = async (u: string) => (await listScripts(u, ws.id)).items.map((s) => s.title).sort();

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  const user = async (n: string) => (await t.db.user.create({ data: { email: `${n}@x.io`, name: n } })).id;
  owner = await user("owner");
  anna = await user("anna");
  boris = await user("boris");
  ws = await createWorkspace(owner, "Acme");
  await t.db.workspace.update({ where: { id: ws.id }, data: { plan: "PRO" } });
  await t.db.membership.create({ data: { userId: anna, workspaceId: ws.id, role: "MEMBER", crmAccess: true, crmScope: "OWN" } });
  await t.db.membership.create({ data: { userId: boris, workspaceId: ws.id, role: "MEMBER", crmAccess: true, crmScope: "OWN" } });
}, 120_000);
afterAll(async () => close?.());

describe("scripts of the team and scripts of one's own", () => {
  let team: string;
  let mine: string;

  it("a leader makes a script for the whole team, everybody else only for themselves", async () => {
    team = (await createScript(owner, ws.id, { title: "Team first touch", stage: "NEW", situation: "FIRST_TOUCH", body: "Hi {имя}", shared: true })).id;
    mine = (await createScript(anna, ws.id, { title: "Anna's own", stage: "NEW", body: "Hello" })).id;
    await expect(createScript(anna, ws.id, { title: "Sneaky", stage: null, body: "x", shared: true })).rejects.toMatchObject({ status: 403 });
    expect(await titles(owner)).toEqual(["Team first touch"]);
    expect(await titles(anna)).toEqual(["Anna's own", "Team first touch"]);
    expect(await titles(boris)).toEqual(["Team first touch"]); // Anna's own is hers alone
    const row = (await listScripts(anna, ws.id)).items.find((s) => s.id === mine);
    expect(row).toMatchObject({ shared: false, mine: true, situation: null });
    expect((await listScripts(boris, ws.id)).items[0]).toMatchObject({ shared: true, mine: false, situation: "FIRST_TOUCH" });
  });

  it("the team's script is changed by its leaders only; a member's own is changed by them only", async () => {
    await expect(updateScript(anna, team, { title: "Changed" })).rejects.toMatchObject({ status: 403 });
    await expect(deleteScript(boris, team)).rejects.toMatchObject({ status: 403 });
    expect((await updateScript(owner, team, { body: "Hi {имя}, it is {моё_имя}" })).body).toContain("{моё_имя}");
    await expect(updateScript(boris, mine, { title: "Hijack" })).rejects.toMatchObject({ status: 404 }); // does not exist for them
    await expect(deleteScript(owner, mine)).rejects.toMatchObject({ status: 404 }); // not even for the owner
    expect((await updateScript(anna, mine, { situation: "REMINDER" })).situation).toBe("REMINDER");
  });

  it("a member copies the team's script as their own and changes it, the original stays", async () => {
    const copy = await copyScript(boris, team);
    expect(copy).toMatchObject({ shared: false, mine: true, title: "Team first touch", situation: "FIRST_TOUCH" });
    await updateScript(boris, copy.id, { body: "My own words, {name}" });
    expect((await listScripts(boris, ws.id)).items.map((s) => [s.shared, s.body]).sort()).toEqual([[false, "My own words, {name}"], [true, "Hi {имя}, it is {моё_имя}"]]);
    await expect(copyScript(boris, mine)).rejects.toMatchObject({ status: 404 }); // somebody else's own cannot be copied
    await deleteScript(boris, copy.id);
    expect(await titles(boris)).toEqual(["Team first touch"]);
  });
});

describe("the ready-made scripts", () => {
  it("a leader adds them for the team, with the moment each is for; pressing again adds nothing", async () => {
    const first = await addStarterScripts(owner, ws.id, "ru");
    expect(first.added).toBeGreaterThan(10);
    const rows = await raw.script.findMany({ where: { workspaceId: ws.id, ownerId: null } });
    expect(rows.find((s) => s.title === "Первое сообщение знакомому")).toMatchObject({ situation: "FIRST_TOUCH", stage: "NEW" });
    expect(rows.find((s) => s.title === "Мягкое напоминание")?.situation).toBe("REMINDER");
    expect(rows.find((s) => s.title === "После презентации: спросить впечатление")?.situation).toBe("AFTER_PRESENTATION");
    expect(rows.find((s) => s.title === "Вернуться через несколько месяцев")?.situation).toBe("RETURN");
    expect(await addStarterScripts(owner, ws.id, "ru")).toMatchObject({ added: 0 });
  });

  it("a member who presses the button gets the ones the team does not have yet, as their own, and nobody else sees them", async () => {
    const r = await addStarterScripts(anna, ws.id, "en");
    expect(r.added).toBeGreaterThan(10); // the team's are in Russian; the English titles are new
    expect(await raw.script.count({ where: { workspaceId: ws.id, ownerId: anna, title: "First message to an acquaintance" } })).toBe(1);
    expect((await titles(boris)).includes("First message to an acquaintance")).toBe(false);
  });

  it("scripts added before the moments existed get theirs by title", async () => {
    await raw.script.deleteMany({ where: { workspaceId: ws.id, title: "Мягкое напоминание" } });
    await raw.script.create({ data: { workspaceId: ws.id, title: "Мягкое напоминание", stage: "NO_REPLY", body: "old", ownerId: null, situation: null } });
    await addStarterScripts(owner, ws.id, "ru");
    expect((await raw.script.findFirstOrThrow({ where: { workspaceId: ws.id, title: "Мягкое напоминание" } })).situation).toBe("REMINDER");
  });
});
