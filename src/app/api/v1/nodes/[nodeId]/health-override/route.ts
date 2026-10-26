import { healthOverrideSchema } from "@/modules/nodes/schemas";
import { json, parseBody, route } from "@/server/http/handler";
import { nodeDto } from "@/server/services/nodes/batch";
import { setHealthOverride, transact } from "@/server/services/nodes/ops";

type P = { nodeId: string };

export const POST = route<P>({}, async ({ req, params, userId }) => {
  const input = await parseBody(req, healthOverrideSchema);
  const { result, changes } = await transact(userId ?? "", (ctx) => setHealthOverride(ctx, params.nodeId, input));
  return json({ node: nodeDto(result), changes });
});

export const DELETE = route<P>({}, async ({ params, userId }) => {
  const { result, changes } = await transact(userId ?? "", (ctx) => setHealthOverride(ctx, params.nodeId, null));
  return json({ node: nodeDto(result), changes });
});
