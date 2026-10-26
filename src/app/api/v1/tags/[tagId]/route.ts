import { parseBody, route } from "@/server/http/handler";
import { deleteTag, tagPatchSchema, updateTag } from "@/server/services/tags";

type P = { tagId: string };

export const PATCH = route<P>({}, async ({ req, params, userId }) => {
  const patch = await parseBody(req, tagPatchSchema);
  return updateTag(userId ?? "", params.tagId, patch);
});

export const DELETE = route<P>({}, async ({ params, userId }) => {
  await deleteTag(userId ?? "", params.tagId);
  return null;
});
