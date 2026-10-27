import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { ApiError, notFound } from "@/server/http/errors";
import { previewOf, safeUrl } from "@/modules/notes/links";
import { loadWorkspaceMember } from "@/server/services/nodes/access";

export const NOTE_LIMIT = 500;

const url = z
  .string()
  .trim()
  .max(2000)
  .transform((v, ctx) => {
    if (v === "") return null;
    const ok = safeUrl(v);
    if (!ok) ctx.addIssue({ code: "custom", message: "Not a web address" });
    return ok;
  });

export const listNotesSchema = z.object({ q: z.string().trim().max(100).optional(), kind: z.enum(["NOTE", "LINK"]).optional(), pinned: z.enum(["0", "1"]).optional() });
export const createNoteSchema = z.object({ kind: z.enum(["NOTE", "LINK"]).default("NOTE"), title: z.string().trim().max(200).default(""), body: z.string().max(50_000).default(""), url: url.nullable().optional(), pinned: z.boolean().default(false) });
export const patchNoteSchema = z.object({ title: z.string().trim().max(200), body: z.string().max(50_000), url: url.nullable(), pinned: z.boolean() }).partial().refine((v) => Object.keys(v).length > 0, "Nothing to update");

const full = (n: { id: string; kind: string; title: string; body: string; url: string | null; pinned: boolean; createdAt: Date; updatedAt: Date }) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, url: n.url, pinned: n.pinned, createdAt: n.createdAt, updatedAt: n.updatedAt });

/** A note of mine, or a 404: other people's notes do not exist as far as anyone else is concerned. */
async function mine(noteId: string, userId: string) {
  const n = await db.note.findUnique({ where: { id: noteId } });
  if (!n || n.userId !== userId) throw notFound("note");
  await loadWorkspaceMember(db, userId, n.workspaceId, "workspace:read");
  return n;
}

/** My notes and links in a workspace, pinned first, newest change first; a list line carries only a preview of the text. */
export async function listNotes(userId: string, workspaceId: string, f: z.infer<typeof listNotesSchema>) {
  await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  const q = f.q;
  const where: Prisma.NoteWhereInput = {
    workspaceId,
    userId,
    ...(f.kind ? { kind: f.kind } : {}),
    ...(f.pinned === "1" ? { pinned: true } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }, { url: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total] = await Promise.all([db.note.findMany({ where, orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }], take: NOTE_LIMIT }), db.note.count({ where: { workspaceId, userId } })]);
  return { items: rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, preview: previewOf(n.body), url: n.url, pinned: n.pinned, updatedAt: n.updatedAt })), total };
}

export async function getNote(userId: string, noteId: string) {
  return full(await mine(noteId, userId));
}

export async function createNote(userId: string, workspaceId: string, input: z.infer<typeof createNoteSchema>) {
  await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  if ((await db.note.count({ where: { workspaceId, userId } })) >= NOTE_LIMIT) throw new ApiError(422, "note_limit", `You can keep up to ${NOTE_LIMIT} notes and links`);
  return full(await db.note.create({ data: { workspaceId, userId, kind: input.kind, title: input.title, body: input.body, url: input.kind === "LINK" ? (input.url ?? null) : null, pinned: input.pinned } }));
}

export async function updateNote(userId: string, noteId: string, patch: z.infer<typeof patchNoteSchema>) {
  const n = await mine(noteId, userId);
  const { url: nextUrl, ...rest } = patch;
  return full(await db.note.update({ where: { id: noteId }, data: { ...rest, ...(n.kind === "LINK" && nextUrl !== undefined ? { url: nextUrl } : {}) } }));
}

export async function deleteNote(userId: string, noteId: string) {
  await mine(noteId, userId);
  await db.note.delete({ where: { id: noteId } });
  return { deleted: true };
}
