import { json, parseBody, route } from "@/server/http/handler";
import { grantGroupShare, listGroupShares, shareSchema } from "@/server/services/crm/shares";

export const GET = route<{ groupId: string }>({}, async ({ params, userId }) => json(await listGroupShares(userId ?? "", params.groupId)));

export const POST = route<{ groupId: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await grantGroupShare(userId ?? "", params.groupId, await parseBody(req, shareSchema)), 201));
