import { json, parseBody, route } from "@/server/http/handler";
import { getRankTracker, rankStateSchema, saveRankState } from "@/server/services/crm/rank-tracker";

type P = { id: string };

export const GET = route<P>({}, async ({ params, userId }) => getRankTracker(userId ?? "", params.id));

/** The person's own rank, target day and values counted by hand. */
export const PUT = route<P>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await saveRankState(userId ?? "", params.id, await parseBody(req, rankStateSchema))));
