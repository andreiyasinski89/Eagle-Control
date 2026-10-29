import { parseBody, route } from "@/server/http/handler";
import { getUiMode, setUiMode, uiModeSchema } from "@/server/services/ui-mode";

export const GET = route({}, async ({ userId }) => getUiMode(userId ?? ""));

export const PUT = route({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, userId }) => setUiMode(userId ?? "", (await parseBody(req, uiModeSchema)).mode));
