import { json, parseBody, route } from "@/server/http/handler";
import { agentSettingsSchema, getAgentSettings, saveAgentSettings } from "@/server/services/crm/agent-settings";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => json(await getAgentSettings(userId ?? "", params.id)));

export const PUT = route<{ id: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await saveAgentSettings(userId ?? "", params.id, await parseBody(req, agentSettingsSchema))));
