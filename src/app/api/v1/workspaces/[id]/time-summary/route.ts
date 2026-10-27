import { route } from "@/server/http/handler";
import { summarySchema, timeSummary } from "@/server/services/time";

export const GET = route<{ id: string }>({}, async ({ req, params, userId }) => timeSummary(userId ?? "", params.id, summarySchema.parse(Object.fromEntries(req.nextUrl.searchParams))));
