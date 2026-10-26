import { parseBody, route } from "@/server/http/handler";
import { disconnectSlack, routesSchema, setSlackRoutes } from "@/server/integrations/slack";

export const PUT = route<{ id: string }>({}, async ({ req, params, userId }) => setSlackRoutes(userId ?? "", params.id, await parseBody(req, routesSchema)));

export const DELETE = route<{ id: string }>({}, async ({ params, userId }) => {
  await disconnectSlack(userId ?? "", params.id);
  return null;
});
