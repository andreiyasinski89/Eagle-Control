import { json, parseBody, route } from "@/server/http/handler";
import { createProjectFromDeal, createProjectFromDealSchema } from "@/server/services/crm/deals";

export const POST = route<{ dealId: string }>({ rateLimit: { limit: 20, windowMs: 60_000 } }, async ({ req, params, userId }) =>
  json(await createProjectFromDeal(userId ?? "", params.dealId, await parseBody(req, createProjectFromDealSchema)), 201),
);
