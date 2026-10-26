import { json, parseBody, route } from "@/server/http/handler";
import { createToken, createTokenSchema, listTokens } from "@/server/public-api/tokens";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => ({ items: await listTokens(userId ?? "", params.id) }));

export const POST = route<{ id: string }>({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await createToken(userId ?? "", params.id, await parseBody(req, createTokenSchema)), 201));
