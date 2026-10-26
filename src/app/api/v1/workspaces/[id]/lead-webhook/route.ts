import { z } from "zod";
import { env } from "@/lib/env";
import { json, parseBody, route } from "@/server/http/handler";
import { getWebhookInfo, rotateWebhookToken } from "@/server/services/crm/lead-ingest";

type P = { id: string };

export const GET = route<P>({}, async ({ params, userId }) => ({ ...(await getWebhookInfo(userId ?? "", params.id)), url: env().APP_URL + "/api/public/hooks/leads" }));

const schema = z.object({ pipelineId: z.string().nullable().optional(), stageId: z.string().nullable().optional(), ownerId: z.string().nullable().optional() });

/** Issues a new token; the plain value is shown once and the previous one stops working. */
export const POST = route<P>({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const opts = await parseBody(req, schema);
  return json({ ...(await rotateWebhookToken(userId ?? "", params.id, opts)), url: env().APP_URL + "/api/public/hooks/leads" }, 201);
});
