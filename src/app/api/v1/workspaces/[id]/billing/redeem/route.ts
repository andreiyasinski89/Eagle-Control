import { parseBody, route } from "@/server/http/handler";
import { redeemPoints, redeemSchema } from "@/server/services/billing";

export const POST = route<{ id: string }>({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ req, params, userId }) => redeemPoints(userId ?? "", params.id, await parseBody(req, redeemSchema)));
