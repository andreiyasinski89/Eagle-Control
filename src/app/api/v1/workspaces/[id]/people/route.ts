import { route } from "@/server/http/handler";
import { listPeople, listPeopleSchema } from "@/server/services/crm/people";

export const GET = route<{ id: string }>({}, async ({ req, params, userId }) => listPeople(userId ?? "", params.id, listPeopleSchema.parse(Object.fromEntries(req.nextUrl.searchParams))));
