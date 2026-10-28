import { json, route } from "@/server/http/handler";
import { recalcAllTemperatures } from "@/server/services/admin";

export const POST = route({ rateLimit: { limit: 5, windowMs: 60_000 } }, async ({ userId }) => json(await recalcAllTemperatures(userId ?? "")));
