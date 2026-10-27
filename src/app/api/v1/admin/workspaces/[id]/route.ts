import { json, parseBody, route } from "@/server/http/handler";
import { planSchema, setWorkspacePlan } from "@/server/services/admin";

export const PATCH = route<{ id: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await setWorkspacePlan(userId ?? "", params.id, (await parseBody(req, planSchema)).plan)));
