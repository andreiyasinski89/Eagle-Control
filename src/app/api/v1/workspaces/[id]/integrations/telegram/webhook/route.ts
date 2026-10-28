import { route } from "@/server/http/handler";
import { connectTelegramBot } from "@/server/services/platform-setup";

/** "Connect the bot": registers this installation's address with Telegram. The bot is shared by everyone, so only the platform owner may. */
export const POST = route<{ id: string }>({ rateLimit: { limit: 5, windowMs: 60_000 } }, async ({ userId }) => connectTelegramBot(userId ?? ""));
