import { z } from "zod";
import { parseBody, route } from "@/server/http/handler";
import { setNodeTags } from "@/server/services/tags";

const schema = z.object({ tagIds: z.array(z.string()).max(30) });

export const PUT = route<{ nodeId: string }>({}, async ({ req, params, userId }) => {
  const { tagIds } = await parseBody(req, schema);
  return setNodeTags(userId ?? "", params.nodeId, tagIds);
});
