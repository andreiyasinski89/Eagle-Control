import { json, parseBody, route } from "@/server/http/handler";
import { createTag, listTags, tagSchema } from "@/server/services/tags";

type P = { id: string };

export const GET = route<P>({}, async ({ params, userId }) => listTags(userId ?? "", params.id));

export const POST = route<P>({}, async ({ req, params, userId }) => {
  const input = await parseBody(req, tagSchema);
  return json(await createTag(userId ?? "", params.id, input), 201);
});
