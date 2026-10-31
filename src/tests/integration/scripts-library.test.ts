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
import { STARTER_SCRIPTS } from "@/modules/crm/starter-scripts";
import { LEGACY_STARTERS } from "@/modules/crm/starter-scripts-legacy";
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
  const team = async (locale: string) => (await listScripts(owner, ws.id, locale)).items.filter((s) => s.shared && s.original);

  it("a leader adds them for the team, with the moment each is for; pressing again adds nothing", async () => {
    const first = await addStarterScripts(owner, ws.id, "ru");
    expect(first.added).toBe(STARTER_SCRIPTS.ru.length);
    const rows = await raw.script.findMany({ where: { workspaceId: ws.id, ownerId: null, starterKey: { not: null } } });
    expect(rows.find((s) => s.starterKey === "s0")).toMatchObject({ situation: "FIRST_TOUCH", stage: "NEW", title: STARTER_SCRIPTS.ru[0]!.title });
    expect(rows.find((s) => s.starterKey === "s15")?.situation).toBe("REMINDER");
    expect(rows.find((s) => s.starterKey === "s7")?.situation).toBe("AFTER_PRESENTATION");
    expect(rows.find((s) => s.starterKey === "s14")?.situation).toBe("RETURN");
    expect(await addStarterScripts(owner, ws.id, "ru")).toMatchObject({ added: 0 });
    expect(await addStarterScripts(owner, ws.id, "en")).toMatchObject({ added: 0 }); // the same scripts, only in another language
  });

  it("they show in the language of the screen, for everybody, and nothing is added for a member who presses the button", async () => {
    expect((await team("en"))[0]!.title).toBe(STARTER_SCRIPTS.en[0]!.title);
    expect((await team("pl"))[0]!.body).toBe(STARTER_SCRIPTS.pl[0]!.body);
    expect((await listScripts(boris, ws.id, "uk")).items.find((s) => s.original)?.title).toBe(STARTER_SCRIPTS.uk[0]!.title);
    expect((await team("de")).length).toBe(STARTER_SCRIPTS.en.length); // an unknown language falls back to English
    expect((await team("de"))[0]!.title).toBe(STARTER_SCRIPTS.en[0]!.title);
    expect(await addStarterScripts(anna, ws.id, "en")).toMatchObject({ added: 0 });
  });

  it("with no language asked, the one saved in the profile is used", async () => {
    await raw.user.update({ where: { id: boris }, data: { locale: "pl" } });
    expect((await listScripts(boris, ws.id)).items.find((s) => s.original)?.title).toBe(STARTER_SCRIPTS.pl[0]!.title);
  });

  it("an edit freezes the script as it was seen; it no longer follows the language", async () => {
    const id = (await team("ru")).find((s) => s.title === STARTER_SCRIPTS.ru[1]!.title)!.id;
    const edited = await updateScript(owner, id, { body: "Моё слово, {name}" }, "ru");
    expect(edited).toMatchObject({ original: false, title: STARTER_SCRIPTS.ru[1]!.title, body: "Моё слово, {name}" });
    expect((await raw.script.findUniqueOrThrow({ where: { id } })).starterKey).toBeNull();
    const en = (await listScripts(owner, ws.id, "en")).items.find((s) => s.id === id)!;
    expect(en).toMatchObject({ original: false, title: STARTER_SCRIPTS.ru[1]!.title, body: "Моё слово, {name}" });
    // an untouched one keeps following
    expect((await listScripts(owner, ws.id, "en")).items.find((s) => s.title === STARTER_SCRIPTS.en[0]!.title)?.original).toBe(true);
    // pressing the button does not bring the edited one back
    expect(await addStarterScripts(owner, ws.id, "en")).toMatchObject({ added: 0 });
  });

  it("changing only the moment also freezes it, and keeps the title the person saw", async () => {
    const id = (await team("en")).find((s) => s.title === STARTER_SCRIPTS.en[2]!.title)!.id;
    const r = await updateScript(owner, id, { situation: "REMINDER" }, "en");
    expect(r).toMatchObject({ original: false, title: STARTER_SCRIPTS.en[2]!.title, body: STARTER_SCRIPTS.en[2]!.body, situation: "REMINDER" });
  });

  it("a copy of a ready-made script is the member's own words, in their language, fixed", async () => {
    const src = (await team("ru")).find((s) => s.title === STARTER_SCRIPTS.ru[3]!.title)!;
    const c = await copyScript(anna, src.id, "pl");
    expect(c).toMatchObject({ shared: false, original: false, title: STARTER_SCRIPTS.pl[3]!.title, body: STARTER_SCRIPTS.pl[3]!.body });
    expect((await raw.script.findUniqueOrThrow({ where: { id: c.id } })).starterKey).toBeNull();
  });

  it("scripts made in the first, formal edition and never edited join the set and follow the language; edited ones stay as they are", async () => {
    const old = LEGACY_STARTERS.ru[16]!;
    const untouched = await raw.script.create({ data: { workspaceId: ws.id, title: old.title, stage: old.stage, body: old.body, ownerId: anna, situation: null } });
    const edited = await raw.script.create({ data: { workspaceId: ws.id, title: old.title, stage: old.stage, body: old.body + " (мои правки)", ownerId: anna, situation: null } });
    const items = (await listScripts(anna, ws.id, "en")).items;
    expect(items.find((s) => s.id === untouched.id)).toMatchObject({ original: true, title: STARTER_SCRIPTS.en[16]!.title });
    expect(items.find((s) => s.id === edited.id)).toMatchObject({ original: false, title: old.title });
    expect((await raw.script.findUniqueOrThrow({ where: { id: untouched.id } })).starterKey).toBe("s16");
  });

  it("the old formal title already in the workspace is not added a second time", async () => {
    const ws2 = await createWorkspace(owner, "Beta");
    const old = LEGACY_STARTERS.ru[0]!;
    await raw.script.create({ data: { workspaceId: ws2.id, title: old.title, stage: old.stage, body: "my own", ownerId: null } });
    const r = await addStarterScripts(owner, ws2.id, "ru");
    expect(r.added).toBe(STARTER_SCRIPTS.ru.length - 1);
  });
});
