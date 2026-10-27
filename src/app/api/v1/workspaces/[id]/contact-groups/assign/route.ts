import { json, parseBody, route } from "@/server/http/handler";
import { assignGroupSchema, assignToGroup } from "@/server/services/crm/groups";

export const POST = route<{ id: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await assignToGroup(userId ?? "", params.id, await parseBody(req, assignGroupSchema))));
