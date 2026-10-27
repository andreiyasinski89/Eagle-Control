import { json, parseBody, route } from "@/server/http/handler";
import { deleteTeam, patchTeamSchema, updateTeam } from "@/server/services/teams";

export const PATCH = route<{ teamId: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await updateTeam(userId ?? "", params.teamId, await parseBody(req, patchTeamSchema))));

export const DELETE = route<{ teamId: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ params, userId }) => json(await deleteTeam(userId ?? "", params.teamId)));
