import { parseBody, route } from "@/server/http/handler";
import { mergeContacts, mergeSchema } from "@/server/services/crm/merge";

export const POST = route<{ id: string }>({}, async ({ req, params, userId }) => mergeContacts(userId ?? "", params.id, await parseBody(req, mergeSchema)));
