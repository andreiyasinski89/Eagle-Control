import { json, parseBody, route } from "@/server/http/handler";
import { createSavedFilter, listSavedFilters, savedFilterSchema } from "@/server/services/saved-filters";

type P = { id: string };

export const GET = route<P>({}, async ({ params, userId }) => listSavedFilters(userId ?? "", params.id));

export const POST = route<P>({}, async ({ req, params, userId }) => {
  const input = await parseBody(req, savedFilterSchema);
  return json(await createSavedFilter(userId ?? "", params.id, input), 201);
});
