import { json, route } from "@/server/http/handler";
import { revokeShare } from "@/server/services/crm/shares";

export const DELETE = route<{ shareId: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ params, userId }) => json(await revokeShare(userId ?? "", params.shareId)));
