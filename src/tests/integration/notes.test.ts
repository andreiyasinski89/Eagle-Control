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
import { createNote, createNoteSchema, deleteNote, getNote, listNotes, listNotesSchema, patchNoteSchema, updateNote } from "@/server/services/notes";

let close: () => Promise<void>;
let raw: PrismaClient;
let owner: string;
let mate: string;
let outsider: string;
let ws: { id: string };

const list = (userId: string, f: Record<string, string> = {}) => listNotes(userId, ws.id, listNotesSchema.parse(f));
const note = (userId: string, input: Record<string, unknown>) => createNote(userId, ws.id, createNoteSchema.parse(input));

beforeAll(async () => {
  const t = await createTestDb();
  raw = t.db;
  holder.db = t.db;
  close = t.close;
  owner = (await t.db.user.create({ data: { email: "o@x.io", name: "Owner" } })).id;
  mate = (await t.db.user.create({ data: { email: "m@x.io", name: "Mate" } })).id;
  outsider = (await t.db.user.create({ data: { email: "x@x.io", name: "Out" } })).id;
  ws = await createWorkspace(owner, "Acme");
  await createWorkspace(outsider, "Other");
  await t.db.membership.create({ data: { userId: mate, workspaceId: ws.id, role: "MEMBER" } });
}, 120_000);
afterAll(async () => close?.());

describe("my notes", () => {
  it("keeps notes and links, pinned first, newest change first", async () => {
    const a = await note(owner, { title: "Plan", body: "Call everyone on Monday" });
    const b = await note(owner, { kind: "LINK", title: "Video", url: "example.com/v", body: "the first one to send" });
    const c = await note(owner, { title: "Ideas" });
    await updateNote(owner, a.id, { pinned: true });
    await updateNote(owner, c.id, { body: "later" });
    const l = await list(owner);
    expect(l.items.map((i) => i.title)).toEqual(["Plan", "Ideas", "Video"]);
    expect(l.total).toBe(3);
    expect(l.items[2]).toMatchObject({ kind: "LINK", url: "https://example.com/v", preview: "the first one to send" });
    expect((await getNote(owner, b.id)).body).toBe("the first one to send");
  });

  it("searches the title, the text and the address; filters links and pinned", async () => {
    expect((await list(owner, { q: "monday" })).items.map((i) => i.title)).toEqual(["Plan"]);
    expect((await list(owner, { q: "example.com" })).items.map((i) => i.title)).toEqual(["Video"]);
    expect((await list(owner, { kind: "LINK" })).items).toHaveLength(1);
    expect((await list(owner, { pinned: "1" })).items.map((i) => i.title)).toEqual(["Plan"]);
  });

  it("a link keeps only a web address (or none yet), and a note keeps no address", async () => {
    const draft = await note(owner, { kind: "LINK", title: "Address to come" });
    expect(draft.url).toBeNull();
    expect(createNoteSchema.safeParse({ kind: "LINK", url: "javascript:alert(1)" }).success).toBe(false);
    expect(patchNoteSchema.safeParse({ url: "data:text/html,x" }).success).toBe(false);
    expect((await note(owner, { kind: "NOTE", title: "Plain", url: "https://example.com" })).url).toBeNull();
    await deleteNote(owner, draft.id);
    const link = (await list(owner, { kind: "LINK" })).items[0]!;
    expect(await updateNote(owner, link.id, patchNoteSchema.parse({ url: "https://new.example.org" }))).toMatchObject({ url: "https://new.example.org/" });
  });

  it("a note keeps what is written, including long text", async () => {
    const n = await note(owner, { title: "Long", body: "x".repeat(20_000) });
    expect((await getNote(owner, n.id)).body).toHaveLength(20_000);
    expect(createNoteSchema.safeParse({ body: "x".repeat(50_001) }).success).toBe(false);
    await deleteNote(owner, n.id);
    await expect(getNote(owner, n.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("notes are private", () => {
  it("nobody else in the workspace sees, reads, changes or deletes them", async () => {
    const mine = (await list(owner)).items[0]!;
    expect((await list(mate)).items).toEqual([]);
    expect((await list(mate)).total).toBe(0);
    await expect(getNote(mate, mine.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateNote(mate, mine.id, { title: "Hacked" })).rejects.toMatchObject({ status: 404 });
    await expect(deleteNote(mate, mine.id)).rejects.toMatchObject({ status: 404 });
    expect((await raw.note.findUnique({ where: { id: mine.id } }))?.title).not.toBe("Hacked");
    // ... not even the owner of the workspace sees what a member writes
    const theirs = await note(mate, { title: "Mate's note" });
    expect((await list(owner)).items.map((i) => i.id)).not.toContain(theirs.id);
    await expect(getNote(owner, theirs.id)).rejects.toMatchObject({ status: 404 });
  });
  it("is closed to people outside the workspace", async () => {
    await expect(list(outsider)).rejects.toBeTruthy();
    await expect(note(outsider, { title: "x" })).rejects.toBeTruthy();
  });
  it("goes away with the workspace", async () => {
    const before = await raw.note.count({ where: { workspaceId: ws.id } });
    expect(before).toBeGreaterThan(0);
    await raw.workspace.delete({ where: { id: ws.id } });
    expect(await raw.note.count({ where: { workspaceId: ws.id } })).toBe(0);
  });
});
