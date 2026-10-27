import { json, route } from "@/server/http/handler";
import { recomputeAllPlans } from "@/server/services/admin";

export const POST = route({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ userId }) => json(await recomputeAllPlans(userId ?? "")));
