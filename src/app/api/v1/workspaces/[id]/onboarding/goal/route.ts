import { json, parseBody, route } from "@/server/http/handler";
import { goalSchema, saveGoal } from "@/server/services/onboarding";

export const PUT = route<{ id: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await saveGoal(userId ?? "", params.id, await parseBody(req, goalSchema))));
