import { json, parseBody, route } from "@/server/http/handler";
import { batchSchema, runBatch } from "@/server/services/nodes/batch";

export const POST = route({ rateLimit: { limit: 120, windowMs: 60_000 } }, async ({ req, userId }) => {
  const { ops } = await parseBody(req, batchSchema);
  return json(await runBatch(userId ?? "", ops));
});
