import { z } from "zod";
import { parseBody, route } from "@/server/http/handler";
import { deleteEndpoint, setEnabled } from "@/server/webhooks";

type P = { endpointId: string };

export const PATCH = route<P>({}, async ({ req, params, userId }) => {
  const { enabled } = await parseBody(req, z.object({ enabled: z.boolean() }));
  await setEnabled(userId ?? "", params.endpointId, enabled);
  return null;
});

export const DELETE = route<P>({}, async ({ params, userId }) => {
  await deleteEndpoint(userId ?? "", params.endpointId);
  return null;
});
