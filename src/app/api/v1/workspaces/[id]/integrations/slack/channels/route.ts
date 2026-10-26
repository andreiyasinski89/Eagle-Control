import { route } from "@/server/http/handler";
import { listSlackChannels } from "@/server/integrations/slack";

export const GET = route<{ id: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ params, userId }) => ({ items: await listSlackChannels(userId ?? "", params.id) }));
