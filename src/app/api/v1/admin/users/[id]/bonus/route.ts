import { json, parseBody, route } from "@/server/http/handler";
import { adjustBonus, bonusSchema } from "@/server/services/admin";

export const POST = route<{ id: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await adjustBonus(userId ?? "", params.id, await parseBody(req, bonusSchema))));
