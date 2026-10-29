import { route } from "@/server/http/handler";
import { getMyOnboarding } from "@/server/services/crm/partner-onboarding";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => getMyOnboarding(userId ?? "", params.id));
