import { route } from "@/server/http/handler";
import { registerTelegramWebhook } from "@/server/integrations/telegram";

/** "Connect the bot": registers this installation's address with Telegram (owners and admins). */
export const POST = route<{ id: string }>({ rateLimit: { limit: 5, windowMs: 60_000 } }, async ({ params, userId }) => registerTelegramWebhook(userId ?? "", params.id));
