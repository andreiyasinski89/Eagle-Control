import { json, parseBody, route } from "@/server/http/handler";
import { stepUpSchema, verifyStepUp } from "@/server/services/admin-stepup";

export const POST = route({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ req, userId }) => json(await verifyStepUp(userId ?? "", (await parseBody(req, stepUpSchema)).code)));
