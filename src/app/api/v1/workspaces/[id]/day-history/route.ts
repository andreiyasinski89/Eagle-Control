import { route } from "@/server/http/handler";
import { getDayHistory, historySchema } from "@/server/services/crm/day-history";

/** The person's own history of the day plan: yesterday, this week, 30 days, a year, or everything. */
export const GET = route<{ id: string }>({}, async ({ req, params, userId }) => getDayHistory(userId ?? "", params.id, historySchema.parse(Object.fromEntries(new URL(req.url).searchParams))));
