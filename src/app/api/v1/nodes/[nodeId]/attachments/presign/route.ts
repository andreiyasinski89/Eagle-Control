import { parseBody, route } from "@/server/http/handler";
import { presignSchema, startUpload } from "@/server/services/attachments";

export const POST = route<{ nodeId: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const input = await parseBody(req, presignSchema);
  return startUpload(userId ?? "", params.nodeId, input);
});
