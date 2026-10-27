import { json, parseBody, route } from "@/server/http/handler";
import { hideSchema, setHidden } from "@/server/services/onboarding";

export const POST = route<{ id: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await setHidden(userId ?? "", params.id, await parseBody(req, hideSchema))));
