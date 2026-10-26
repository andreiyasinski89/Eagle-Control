import { parseBody, route } from "@/server/http/handler";
import { addEntry, entrySchema, listEntries } from "@/server/services/time";

type P = { nodeId: string };

export const GET = route<P>({}, async ({ params, userId }) => ({ items: await listEntries(userId ?? "", params.nodeId) }));

export const POST = route<P>({}, async ({ req, params, userId }) => {
  const entry = await addEntry(userId ?? "", params.nodeId, await parseBody(req, entrySchema));
  return entry;
});
