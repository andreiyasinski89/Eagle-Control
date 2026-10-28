import { json, parseBody, route } from "@/server/http/handler";
import { memberRoleSchema, setMemberRole } from "@/server/services/admin";
import { requireFreshAdmin } from "@/server/services/admin-stepup";

export const PATCH = route<{ id: string; userId: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => (await requireFreshAdmin(userId ?? ""), json(await setMemberRole(userId ?? "", params.id, params.userId, await parseBody(req, memberRoleSchema)))));
