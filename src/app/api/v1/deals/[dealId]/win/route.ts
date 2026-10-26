import { route } from "@/server/http/handler";
import { winDeal } from "@/server/services/crm/deals";

export const POST = route<{ dealId: string }>({}, async ({ params, userId }) => winDeal(userId ?? "", params.dealId));
