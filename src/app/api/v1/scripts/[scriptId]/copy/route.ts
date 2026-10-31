import { json, route } from "@/server/http/handler";
import { copyScript } from "@/server/services/crm/scripts";

/** A copy of a script of the team as one's own. */
export const POST = route<{ scriptId: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await copyScript(userId ?? "", params.scriptId, new URL(req.url).searchParams.get("locale")), 201));
