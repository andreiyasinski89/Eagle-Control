import { parseBody, route } from "@/server/http/handler";
import { moveDeal, moveDealSchema } from "@/server/services/crm/deals";

export const POST = route<{ dealId: string }>({ rateLimit: { limit: 300, windowMs: 60_000 } }, async ({ req, params, userId }) =>
  moveDeal(userId ?? "", params.dealId, await parseBody(req, moveDealSchema)),
);
