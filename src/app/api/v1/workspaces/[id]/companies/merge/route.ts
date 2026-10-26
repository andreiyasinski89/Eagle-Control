import { parseBody, route } from "@/server/http/handler";
import { mergeCompanies, mergeSchema } from "@/server/services/crm/merge";

export const POST = route<{ id: string }>({}, async ({ req, params, userId }) => mergeCompanies(userId ?? "", params.id, await parseBody(req, mergeSchema)));
