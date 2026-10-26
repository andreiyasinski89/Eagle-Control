import { patchNodeSchema } from "@/modules/nodes/schemas";
import { json, parseBody, route } from "@/server/http/handler";
import { nodeDto } from "@/server/services/nodes/batch";
import { archiveNode, patchNode, transact } from "@/server/services/nodes/ops";
import { getNodeDetail } from "@/server/services/nodes/queries";

type P = { nodeId: string };

export const GET = route<P>({}, async ({ params, userId }) => getNodeDetail(userId ?? "", params.nodeId));

export const PATCH = route<P>({ rateLimit: { limit: 600, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const patch = await parseBody(req, patchNodeSchema);
  const { result, changes } = await transact(userId ?? "", (ctx) => patchNode(ctx, params.nodeId, patch));
  return json({ node: nodeDto(result), changes });
});

/** Soft delete: the node and its subtree are archived and can be restored. */
export const DELETE = route<P>({}, async ({ params, userId }) => {
  const { result, changes } = await transact(userId ?? "", (ctx) => archiveNode(ctx, params.nodeId));
  return json({ ids: result.ids, archivedAt: result.archivedAt, changes });
});
