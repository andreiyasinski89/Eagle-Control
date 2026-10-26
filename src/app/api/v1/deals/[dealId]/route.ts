import { parseBody, route } from "@/server/http/handler";
import { archiveDeal, getDeal, patchDealSchema, updateDeal } from "@/server/services/crm/deals";

type P = { dealId: string };

export const GET = route<P>({}, async ({ params, userId }) => getDeal(userId ?? "", params.dealId));

export const PATCH = route<P>({ rateLimit: { limit: 300, windowMs: 60_000 } }, async ({ req, params, userId }) =>
  updateDeal(userId ?? "", params.dealId, await parseBody(req, patchDealSchema)),
);

export const DELETE = route<P>({}, async ({ params, userId }) => {
  await archiveDeal(userId ?? "", params.dealId);
  return null;
});
