import { route } from "@/server/http/handler";
import { getClientMap } from "@/server/services/crm/client-map";

export const GET = route<{ companyId: string }>({}, async ({ params, userId }) => getClientMap(userId ?? "", params.companyId));
