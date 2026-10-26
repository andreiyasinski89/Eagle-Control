import { route } from "@/server/http/handler";
import { contactDuplicateGroups } from "@/server/services/crm/contacts";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => contactDuplicateGroups(userId ?? "", params.id));
