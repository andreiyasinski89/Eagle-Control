import { route } from "@/server/http/handler";
import { getBilling } from "@/server/services/billing";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => getBilling(userId ?? "", params.id));
