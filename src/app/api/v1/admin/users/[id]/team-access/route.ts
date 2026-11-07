import { json, parseBody, route } from "@/server/http/handler";
import { setTeamAccess, teamAccessSchema } from "@/server/services/admin";
import { requireFreshAdmin } from "@/server/services/admin-stepup";

/** The platform owner switches a person's free team access: on, off, or by the chain of invitations again (the branch follows). */
export const POST = route<{ id: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => (await requireFreshAdmin(userId ?? ""), json(await setTeamAccess(userId ?? "", params.id, await parseBody(req, teamAccessSchema)))));
