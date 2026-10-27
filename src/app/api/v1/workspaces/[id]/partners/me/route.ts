import { json, route } from "@/server/http/handler";
import { ensureMyPartnerCard } from "@/server/services/crm/people";

export const POST = route<{ id: string }>({ rateLimit: { limit: 20, windowMs: 60_000 } }, async ({ params, userId }) => json(await ensureMyPartnerCard(userId ?? "", params.id)));
