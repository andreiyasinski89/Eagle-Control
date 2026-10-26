import { parseBody, route } from "@/server/http/handler";
import { presignSchema } from "@/server/services/attachments";
import { startPortalUpload } from "@/server/services/portal";

export const POST = route<{ nodeId: string }>({ rateLimit: { limit: 20, windowMs: 60_000 } }, async ({ req, params, userId }) => startPortalUpload(userId ?? "", params.nodeId, await parseBody(req, presignSchema)));
