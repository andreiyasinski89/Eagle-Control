import { json, parseBody, route } from "@/server/http/handler";
import { createEndpoint, createEndpointSchema, listEndpoints } from "@/server/webhooks";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => ({ items: await listEndpoints(userId ?? "", params.id) }));

export const POST = route<{ id: string }>({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await createEndpoint(userId ?? "", params.id, await parseBody(req, createEndpointSchema)), 201));
