import { route } from "@/server/http/handler";
import { createLinkCode } from "@/server/integrations/telegram";

export const POST = route<{ id: string }>({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ params, userId }) => createLinkCode(userId ?? "", params.id));
