import { json, parseBody, route } from "@/server/http/handler";
import { getTeamHeat, setTeamHeat, teamHeatSchema } from "@/server/services/crm/team-tree";

type P = { id: string };

export const GET = route<P>({}, async ({ params, userId }) => getTeamHeat(userId ?? "", params.id));

/** Owners and admins only. */
export const PUT = route<P>({ rateLimit: { limit: 20, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await setTeamHeat(userId ?? "", params.id, await parseBody(req, teamHeatSchema))));
