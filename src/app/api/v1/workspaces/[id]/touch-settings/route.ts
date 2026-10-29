import { json, parseBody, route } from "@/server/http/handler";
import { getTouchSettings, saveTouchSettings, touchSettingsSchema } from "@/server/services/crm/touch-queue";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => json(await getTouchSettings(userId ?? "", params.id)));

export const PUT = route<{ id: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await saveTouchSettings(userId ?? "", params.id, await parseBody(req, touchSettingsSchema))));
