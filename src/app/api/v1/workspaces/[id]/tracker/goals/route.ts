import { json, parseBody, route } from "@/server/http/handler";
import { goalsSchema, saveGoals } from "@/server/services/crm/tracker";

export const PUT = route<{ id: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await saveGoals(userId ?? "", params.id, await parseBody(req, goalsSchema))));
