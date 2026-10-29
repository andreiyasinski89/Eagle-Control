import { json, parseBody, route } from "@/server/http/handler";
import { rankPlanSchema, saveRankPlan } from "@/server/services/crm/rank-tracker";

/** Owners and admins only. */
export const PUT = route<{ id: string }>({ rateLimit: { limit: 20, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await saveRankPlan(userId ?? "", params.id, await parseBody(req, rankPlanSchema))));
