import { parseBody, route } from "@/server/http/handler";
import { erasureSchema, gdprErase } from "@/server/services/crm/contacts";

/** Irreversible. Body must be {"confirm":"ERASE"}; owners and admins only. */
export const POST = route<{ contactId: string }>({ rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  await parseBody(req, erasureSchema);
  await gdprErase(userId ?? "", params.contactId);
  return null;
});
