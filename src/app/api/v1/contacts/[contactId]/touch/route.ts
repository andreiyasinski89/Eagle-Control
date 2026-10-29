import { json, parseBody, route } from "@/server/http/handler";
import { recordTouchResult, touchResultSchema } from "@/server/services/crm/touch-queue";

/** What came of a touch: written down in one go (the feed, the next step, the stage, the day to come back, the meeting). */
export const POST = route<{ contactId: string }>({ rateLimit: { limit: 120, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await recordTouchResult(userId ?? "", params.contactId, await parseBody(req, touchResultSchema))));
