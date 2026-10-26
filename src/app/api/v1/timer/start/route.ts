import { z } from "zod";
import { parseBody, route } from "@/server/http/handler";
import { startTimer } from "@/server/services/time";

export const POST = route({}, async ({ req, userId }) => {
  const { nodeId } = await parseBody(req, z.object({ nodeId: z.string().min(1) }));
  return startTimer(userId ?? "", nodeId);
});
