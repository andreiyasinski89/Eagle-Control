import { route } from "@/server/http/handler";
import { listIngests } from "@/server/services/crm/lead-ingest";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => listIngests(userId ?? "", params.id));
