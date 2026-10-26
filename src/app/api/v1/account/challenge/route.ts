import { z } from "zod";
import { parseBody, route } from "@/server/http/handler";
import { sendChallenge } from "@/server/services/account";

export const POST = route({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ req, userId }) => {
  const { action } = await parseBody(req, z.object({ action: z.enum(["export", "delete"]) }));
  return sendChallenge(userId ?? "", action);
});
