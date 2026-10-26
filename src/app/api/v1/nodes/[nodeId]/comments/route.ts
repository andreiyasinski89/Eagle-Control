import { json, parseBody, route } from "@/server/http/handler";
import { createComment, createCommentSchema, listComments } from "@/server/services/comments";

type P = { nodeId: string };

export const GET = route<P>({}, async ({ params, userId }) => listComments(userId ?? "", params.nodeId));

export const POST = route<P>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const input = await parseBody(req, createCommentSchema);
  return json(await createComment(userId ?? "", params.nodeId, input), 201);
});
