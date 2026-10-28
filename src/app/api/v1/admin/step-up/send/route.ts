import { json, route } from "@/server/http/handler";
import { sendStepUpCode } from "@/server/services/admin-stepup";

export const POST = route({ rateLimit: { limit: 5, windowMs: 60_000 } }, async ({ userId }) => json(await sendStepUpCode(userId ?? "")));
