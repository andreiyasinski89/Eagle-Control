import { z } from "zod";
import { json, parseBody, route } from "@/server/http/handler";
import { createLink, transact } from "@/server/services/nodes/ops";

const schema = z.object({
  toNodeId: z.string(),
  kind: z.enum(["BLOCKS", "RELATES", "ATTACHED"]),
});

/** Creates a link from this node to another (for BLOCKS: this node blocks the other). */
export const POST = route<{ nodeId: string }>({}, async ({ req, params, userId }) => {
  const input = await parseBody(req, schema);
  const { result, changes } = await transact(userId ?? "", (ctx) => createLink(ctx, { fromNodeId: params.nodeId, ...input }));
  return json({ link: result, changes }, 201);
});
