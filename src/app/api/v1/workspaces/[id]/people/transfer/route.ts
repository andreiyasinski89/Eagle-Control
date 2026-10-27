import { json, parseBody, route } from "@/server/http/handler";
import { transferContacts, transferSchema } from "@/server/services/crm/partners";

// Up to 500 people at once.
export const maxDuration = 60;

export const POST = route<{ id: string }>({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, params, userId }) => json(await transferContacts(userId ?? "", params.id, await parseBody(req, transferSchema))));
