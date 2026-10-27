import { route } from "@/server/http/handler";
import { getHandoffCard } from "@/server/services/crm/partners";

export const GET = route<{ contactId: string }>({}, async ({ params, userId }) => getHandoffCard(userId ?? "", params.contactId));
