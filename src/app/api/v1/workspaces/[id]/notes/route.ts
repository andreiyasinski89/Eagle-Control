import { json, parseBody, route } from "@/server/http/handler";
import { createNote, createNoteSchema, listNotes, listNotesSchema } from "@/server/services/notes";

export const GET = route<{ id: string }>({}, async ({ req, params, userId }) => listNotes(userId ?? "", params.id, listNotesSchema.parse(Object.fromEntries(req.nextUrl.searchParams))));

export const POST = route<{ id: string }>({ rateLimit: { limit: 120, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await createNote(userId ?? "", params.id, await parseBody(req, createNoteSchema)), 201));
