import { json, parseBody, route } from "@/server/http/handler";
import { createDeal, createDealSchema, listDeals, listDealsSchema } from "@/server/services/crm/deals";

type P = { id: string };

export const GET = route<P>({}, async ({ req, params, userId }) =>
  listDeals(userId ?? "", params.id, listDealsSchema.parse(Object.fromEntries(req.nextUrl.searchParams))),
);

export const POST = route<P>({}, async ({ req, params, userId }) => json(await createDeal(userId ?? "", params.id, await parseBody(req, createDealSchema)), 201));
