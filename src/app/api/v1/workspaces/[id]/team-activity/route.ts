import { route } from "@/server/http/handler";
import { getTeamActivity, teamActivitySchema } from "@/server/services/crm/team-activity";

export const GET = route<{ id: string }>({}, async ({ req, params, userId }) => getTeamActivity(userId ?? "", params.id, teamActivitySchema.parse(Object.fromEntries(new URL(req.url).searchParams))));
