import { route } from "@/server/http/handler";
import { getOnboarding } from "@/server/services/onboarding";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => getOnboarding(userId ?? "", params.id));
