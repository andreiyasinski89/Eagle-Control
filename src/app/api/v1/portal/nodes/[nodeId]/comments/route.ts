import { json, parseBody, route } from "@/server/http/handler";
import { addPortalComment, portalCommentSchema } from "@/server/services/portal";

export const POST = route<{ nodeId: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await addPortalComment(userId ?? "", params.nodeId, await parseBody(req, portalCommentSchema)), 201));
