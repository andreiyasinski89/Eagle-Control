import { json, parseBody, route } from "@/server/http/handler";
import { overdueSchema, resolveOverdue } from "@/server/services/crm/touch-queue";

/** The late dates sorted out in one go: taken off, or moved to 7 or 14 days from today. With `dryRun` it only counts. */
export const POST = route<{ id: string }>({ rateLimit: { limit: 20, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await resolveOverdue(userId ?? "", params.id, await parseBody(req, overdueSchema))));
