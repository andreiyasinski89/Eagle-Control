import { json, parseBody, route } from "@/server/http/handler";
import { grantContactShare, listContactShares, shareSchema } from "@/server/services/crm/shares";

export const GET = route<{ contactId: string }>({}, async ({ params, userId }) => json(await listContactShares(userId ?? "", params.contactId)));

export const POST = route<{ contactId: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await grantContactShare(userId ?? "", params.contactId, await parseBody(req, shareSchema)), 201));
