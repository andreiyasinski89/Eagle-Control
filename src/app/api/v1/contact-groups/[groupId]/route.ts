import { json, parseBody, route } from "@/server/http/handler";
import { deleteGroup, patchGroupSchema, updateGroup } from "@/server/services/crm/groups";

export const PATCH = route<{ groupId: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await updateGroup(userId ?? "", params.groupId, await parseBody(req, patchGroupSchema))));

export const DELETE = route<{ groupId: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ params, userId }) => json(await deleteGroup(userId ?? "", params.groupId)));
