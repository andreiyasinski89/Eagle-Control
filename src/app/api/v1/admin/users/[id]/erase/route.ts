import { json, parseBody, route } from "@/server/http/handler";
import { eraseUserByAdmin, eraseUserSchema } from "@/server/services/admin";

export const POST = route<{ id: string }>({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await eraseUserByAdmin(userId ?? "", params.id, await parseBody(req, eraseUserSchema))));
