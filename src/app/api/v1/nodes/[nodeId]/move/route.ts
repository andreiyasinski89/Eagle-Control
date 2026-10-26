import { moveNodeSchema } from "@/modules/nodes/schemas";
import { json, parseBody, route } from "@/server/http/handler";
import { nodeDto } from "@/server/services/nodes/batch";
import { moveNode, transact } from "@/server/services/nodes/ops";

export const POST = route<{ nodeId: string }>({ rateLimit: { limit: 300, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const input = await parseBody(req, moveNodeSchema);
  const { result, changes } = await transact(userId ?? "", (ctx) => moveNode(ctx, params.nodeId, input));
  return json({ node: nodeDto(result), changes });
});
