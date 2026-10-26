import { route } from "@/server/http/handler";
import { gdprExport } from "@/server/services/crm/contacts";

export const GET = route<{ contactId: string }>({ rateLimit: { limit: 20, windowMs: 60_000 } }, async ({ params, userId }) => gdprExport(userId ?? "", params.contactId));
