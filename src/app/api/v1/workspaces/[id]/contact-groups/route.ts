import { json, parseBody, route } from "@/server/http/handler";
import { createGroup, createGroupSchema, listGroups } from "@/server/services/crm/groups";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => listGroups(userId ?? "", params.id));

export const POST = route<{ id: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await createGroup(userId ?? "", params.id, await parseBody(req, createGroupSchema)), 201));
