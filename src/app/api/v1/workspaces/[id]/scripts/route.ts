import { json, parseBody, route } from "@/server/http/handler";
import { createScript, createScriptSchema, listScripts } from "@/server/services/crm/scripts";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => listScripts(userId ?? "", params.id));

export const POST = route<{ id: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await createScript(userId ?? "", params.id, await parseBody(req, createScriptSchema)), 201));
