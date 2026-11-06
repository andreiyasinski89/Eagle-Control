import { json, parseBody, route } from "@/server/http/handler";
import { undoTouch, undoTouchSchema } from "@/server/services/crm/touch-queue";

/** Takes back a "wrote, waiting" touch that was written down by itself a moment ago (the "Undo" under the queue). */
export const POST = route<{ contactId: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await undoTouch(userId ?? "", params.contactId, await parseBody(req, undoTouchSchema))));
