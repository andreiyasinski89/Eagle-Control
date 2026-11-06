import { z } from "zod";
import { parseBody, route } from "@/server/http/handler";
import { markReplied } from "@/server/services/crm/contacts";

// Everything is optional: a bare press still works. `at` is when the person answered (never later than now).
const schema = z.object({ text: z.string().trim().max(5000).optional(), at: z.string().datetime().optional(), subject: z.string().trim().max(200).optional() });

/** The "replied" button: the person wrote back, the answer is ours to give. The reply goes into the feed as an incoming message. */
export const POST = route<{ contactId: string }>({ rateLimit: { limit: 120, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const { text, at, subject } = await parseBody(req, schema);
  const now = new Date();
  const when = at ? new Date(Math.min(new Date(at).getTime(), now.getTime())) : now;
  return markReplied(userId ?? "", params.contactId, when, { text: text ?? null, ...(subject ? { subject } : {}) });
});
