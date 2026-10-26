import { route } from "@/server/http/handler";
import { syncNow } from "@/server/integrations/google";

export const POST = route<{ id: string }>({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ params, userId }) => syncNow(userId ?? "", params.id));
