import { parseBody, route } from "@/server/http/handler";
import { deleteEntry, patchEntrySchema, updateEntry } from "@/server/services/time";

type P = { entryId: string };

export const PATCH = route<P>({}, async ({ req, params, userId }) => updateEntry(userId ?? "", params.entryId, await parseBody(req, patchEntrySchema)));

export const DELETE = route<P>({}, async ({ params, userId }) => {
  await deleteEntry(userId ?? "", params.entryId);
  return null;
});
