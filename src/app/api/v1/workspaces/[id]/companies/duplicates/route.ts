import { route } from "@/server/http/handler";
import { companyDuplicateGroups } from "@/server/services/crm/companies";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => companyDuplicateGroups(userId ?? "", params.id));
