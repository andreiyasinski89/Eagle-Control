import { json, parseBody, route } from "@/server/http/handler";
import { addPeople, addPeopleSchema } from "@/server/services/crm/people";

// Up to 300 people at once: give the function the longest time the plan allows.
export const maxDuration = 60;

export const POST = route<{ id: string }>({ rateLimit: { limit: 20, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await addPeople(userId ?? "", params.id, await parseBody(req, addPeopleSchema)), 201));
