import { route } from "@/server/http/handler";
import { startCheckout } from "@/server/services/billing";

export const POST = route<{ id: string }>({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ params, userId }) => startCheckout(userId ?? "", params.id));
