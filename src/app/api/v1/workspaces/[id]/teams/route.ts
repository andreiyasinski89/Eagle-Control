import { json, parseBody, route } from "@/server/http/handler";
import { createTeam, createTeamSchema, listTeams } from "@/server/services/teams";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => listTeams(userId ?? "", params.id));

export const POST = route<{ id: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await createTeam(userId ?? "", params.id, await parseBody(req, createTeamSchema)), 201));
