import { route } from "@/server/http/handler";
import { listPartners } from "@/server/services/crm/partners";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => listPartners(userId ?? "", params.id));
