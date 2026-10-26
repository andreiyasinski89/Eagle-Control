import { json, parseBody, route } from "@/server/http/handler";
import { confirmSchema } from "@/server/services/attachments";
import { confirmPortalUpload } from "@/server/services/portal";

export const POST = route<{ nodeId: string }>({ rateLimit: { limit: 20, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await confirmPortalUpload(userId ?? "", params.nodeId, await parseBody(req, confirmSchema)), 201));
