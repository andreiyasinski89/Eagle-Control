import { z } from "zod";
import { parseBody, route } from "@/server/http/handler";
import { transferOwnership } from "@/server/services/account";

export const POST = route<{ id: string }>({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const { userId: target } = await parseBody(req, z.object({ userId: z.string().min(1) }));
  await transferOwnership(userId ?? "", params.id, target);
  return null;
});
