import { route } from "@/server/http/handler";
import { getNetwork } from "@/server/services/crm/network";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => getNetwork(userId ?? "", params.id));
