import { createNodeSchema } from "@/modules/nodes/schemas";
import { json, parseBody, route } from "@/server/http/handler";
import { nodeDto } from "@/server/services/nodes/batch";
import { createNode, transact } from "@/server/services/nodes/ops";

export const POST = route({ rateLimit: { limit: 300, windowMs: 60_000 } }, async ({ req, userId }) => {
  const input = await parseBody(req, createNodeSchema);
  const { result, changes } = await transact(userId ?? "", (ctx) => createNode(ctx, input));
  return json({ node: nodeDto(result), changes }, 201);
});
