import { parseBody, route } from "@/server/http/handler";
import { deleteActivity, patchActivitySchema, updateActivity } from "@/server/services/crm/activities";

type P = { activityId: string };

export const PATCH = route<P>({}, async ({ req, params, userId }) => updateActivity(userId ?? "", params.activityId, await parseBody(req, patchActivitySchema)));

export const DELETE = route<P>({}, async ({ params, userId }) => {
  await deleteActivity(userId ?? "", params.activityId);
  return null;
});
