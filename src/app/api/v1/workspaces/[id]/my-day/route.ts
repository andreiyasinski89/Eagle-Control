import { route } from "@/server/http/handler";
import { getMyDay } from "@/server/services/crm/my-day";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => getMyDay(userId ?? "", params.id));
