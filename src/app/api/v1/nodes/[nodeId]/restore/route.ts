import { json, route } from "@/server/http/handler";
import { restoreNode, transact } from "@/server/services/nodes/ops";

export const POST = route<{ nodeId: string }>({}, async ({ params, userId }) => {
  const { result, changes } = await transact(userId ?? "", (ctx) => restoreNode(ctx, params.nodeId));
  return json({ ids: result.ids, changes });
});
