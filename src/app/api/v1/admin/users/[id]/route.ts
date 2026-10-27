import { json, route } from "@/server/http/handler";
import { getUserDetail } from "@/server/services/admin";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => json(await getUserDetail(userId ?? "", params.id)));
