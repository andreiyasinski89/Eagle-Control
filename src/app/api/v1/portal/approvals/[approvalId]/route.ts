import { parseBody, route } from "@/server/http/handler";
import { decide, decisionSchema } from "@/server/services/portal";

export const POST = route<{ approvalId: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => decide(userId ?? "", params.approvalId, await parseBody(req, decisionSchema)));
