import { json, parseBody, route } from "@/server/http/handler";
import { listRules, saveRules, saveRulesSchema } from "@/server/services/crm/stage-rules";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => listRules(userId ?? "", params.id));

export const PUT = route<{ id: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await saveRules(userId ?? "", params.id, await parseBody(req, saveRulesSchema))));
