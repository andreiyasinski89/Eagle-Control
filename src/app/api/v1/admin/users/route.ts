import { json, route } from "@/server/http/handler";
import { listUsers, listUsersSchema } from "@/server/services/admin";

export const GET = route({}, async ({ req, userId }) => json(await listUsers(userId ?? "", listUsersSchema.parse(Object.fromEntries(new URL(req.url).searchParams)))));
