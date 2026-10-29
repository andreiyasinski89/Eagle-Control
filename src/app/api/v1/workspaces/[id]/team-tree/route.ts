import { route } from "@/server/http/handler";
import { getTeamTree, teamTreeSchema } from "@/server/services/crm/team-tree";

export const GET = route<{ id: string }>({}, async ({ req, params, userId }) => getTeamTree(userId ?? "", params.id, teamTreeSchema.parse(Object.fromEntries(new URL(req.url).searchParams))));
