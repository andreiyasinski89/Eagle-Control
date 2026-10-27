import { route } from "@/server/http/handler";
import { listGrants } from "@/server/services/oauth";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => ({ items: await listGrants(userId ?? "", params.id) }));
