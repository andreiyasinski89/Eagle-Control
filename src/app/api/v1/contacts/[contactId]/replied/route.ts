import { route } from "@/server/http/handler";
import { markReplied } from "@/server/services/crm/contacts";

/** The "replied" button: the person wrote back, the answer is ours to give. */
export const POST = route<{ contactId: string }>({ rateLimit: { limit: 120, windowMs: 60_000 } }, async ({ params, userId }) => markReplied(userId ?? "", params.contactId));
