import { parseBody, route } from "@/server/http/handler";
import { loseDeal, loseDealSchema } from "@/server/services/crm/deals";

export const POST = route<{ dealId: string }>({}, async ({ req, params, userId }) => {
  const { lostReasonId } = await parseBody(req, loseDealSchema);
  return loseDeal(userId ?? "", params.dealId, lostReasonId);
});
