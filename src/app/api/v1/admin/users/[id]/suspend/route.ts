import { z } from "zod";
import { json, parseBody, route } from "@/server/http/handler";
import { setSuspended } from "@/server/services/admin";

export const POST = route<{ id: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const { suspended } = await parseBody(req, z.object({ suspended: z.boolean() }));
  return json(await setSuspended(userId ?? "", params.id, suspended));
});
