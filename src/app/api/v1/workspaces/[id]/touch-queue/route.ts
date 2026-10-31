import { json, route } from "@/server/http/handler";
import { getTouchQueue } from "@/server/services/crm/touch-queue";

/** The people whose turn it is, one card each, in the order to go through them. */
export const GET = route<{ id: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await getTouchQueue(userId ?? "", params.id, new Date(), new URL(req.url).searchParams.get("locale"))));
