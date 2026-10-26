import { json, parseBody, route } from "@/server/http/handler";
import { activitySchema, createActivity, listActivities, listActivitiesSchema } from "@/server/services/crm/activities";

type P = { id: string };

export const GET = route<P>({}, async ({ req, params, userId }) =>
  listActivities(userId ?? "", params.id, listActivitiesSchema.parse(Object.fromEntries(req.nextUrl.searchParams))),
);

export const POST = route<P>({ rateLimit: { limit: 120, windowMs: 60_000 } }, async ({ req, params, userId }) =>
  json(await createActivity(userId ?? "", params.id, await parseBody(req, activitySchema)), 201),
);
