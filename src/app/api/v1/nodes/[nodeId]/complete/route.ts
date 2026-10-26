import { json, route } from "@/server/http/handler";
import { nodeDto } from "@/server/services/nodes/batch";
import { completeNode, transact } from "@/server/services/nodes/ops";

export const POST = route<{ nodeId: string }>({}, async ({ params, userId }) => {
  const { result, changes } = await transact(userId ?? "", (ctx) => completeNode(ctx, params.nodeId));
  return json({ node: nodeDto(result), changes });
});
