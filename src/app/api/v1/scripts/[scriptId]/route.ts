import { json, parseBody, route } from "@/server/http/handler";
import { deleteScript, patchScriptSchema, updateScript } from "@/server/services/crm/scripts";

export const PATCH = route<{ scriptId: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await updateScript(userId ?? "", params.scriptId, await parseBody(req, patchScriptSchema), new URL(req.url).searchParams.get("locale"))));

export const DELETE = route<{ scriptId: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ params, userId }) => json(await deleteScript(userId ?? "", params.scriptId)));
