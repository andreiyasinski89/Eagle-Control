import { json, parseBody, route } from "@/server/http/handler";
import { setStepSkipped, skipSchema } from "@/server/services/onboarding";

export const POST = route<{ id: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await setStepSkipped(userId ?? "", params.id, await parseBody(req, skipSchema))));
