import { z } from "zod";
import { parseBody, route } from "@/server/http/handler";
import { reopenDeal } from "@/server/services/crm/deals";

export const POST = route<{ dealId: string }>({}, async ({ req, params, userId }) => {
  const { stageId } = await parseBody(req, z.object({ stageId: z.string().optional() }));
  return reopenDeal(userId ?? "", params.dealId, stageId);
});
