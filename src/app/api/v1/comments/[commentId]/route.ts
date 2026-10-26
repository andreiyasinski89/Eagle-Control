import { z } from "zod";
import { parseBody, route } from "@/server/http/handler";
import { commentBodySchema, deleteComment, updateComment } from "@/server/services/comments";

type P = { commentId: string };

export const PATCH = route<P>({}, async ({ req, params, userId }) => {
  const { body } = await parseBody(req, z.object({ body: commentBodySchema }));
  return updateComment(userId ?? "", params.commentId, body);
});

export const DELETE = route<P>({}, async ({ params, userId }) => {
  await deleteComment(userId ?? "", params.commentId);
  return null;
});
