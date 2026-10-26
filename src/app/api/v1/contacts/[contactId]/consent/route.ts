import { z } from "zod";
import { parseBody, route } from "@/server/http/handler";
import { setConsent } from "@/server/services/crm/contacts";

const schema = z.object({ given: z.boolean(), source: z.string().trim().max(80).optional() });

export const PUT = route<{ contactId: string }>({}, async ({ req, params, userId }) => {
  const { given, source } = await parseBody(req, schema);
  return setConsent(userId ?? "", params.contactId, given, source);
});
