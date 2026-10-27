import { route } from "@/server/http/handler";
import { getWeek, weekSchema } from "@/server/services/crm/tracker";

export const GET = route<{ id: string }>({}, async ({ req, params, userId }) => getWeek(userId ?? "", params.id, weekSchema.parse(Object.fromEntries(req.nextUrl.searchParams))));
