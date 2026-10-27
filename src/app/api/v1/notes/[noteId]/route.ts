import { json, parseBody, route } from "@/server/http/handler";
import { deleteNote, getNote, patchNoteSchema, updateNote } from "@/server/services/notes";

export const GET = route<{ noteId: string }>({}, async ({ params, userId }) => getNote(userId ?? "", params.noteId));

// A note saves as it is typed, so edits come often.
export const PATCH = route<{ noteId: string }>({ rateLimit: { limit: 300, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await updateNote(userId ?? "", params.noteId, await parseBody(req, patchNoteSchema))));

export const DELETE = route<{ noteId: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ params, userId }) => json(await deleteNote(userId ?? "", params.noteId)));
