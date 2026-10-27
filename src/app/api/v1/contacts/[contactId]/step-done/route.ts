import { json, parseBody, route } from "@/server/http/handler";
import { completeStep, stepDoneSchema } from "@/server/services/crm/tracker";

export const POST = route<{ contactId: string }>({ rateLimit: { limit: 120, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await completeStep(userId ?? "", params.contactId, await parseBody(req, stepDoneSchema))));
