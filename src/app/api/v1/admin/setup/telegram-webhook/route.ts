import { json, route } from "@/server/http/handler";
import { connectTelegramBot } from "@/server/services/platform-setup";

export const POST = route({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ userId }) => json(await connectTelegramBot(userId ?? "")));
