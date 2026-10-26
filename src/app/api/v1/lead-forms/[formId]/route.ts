import { env } from "@/lib/env";
import { parseBody, route } from "@/server/http/handler";
import { deleteLeadForm, embedSnippets, patchLeadFormSchema, updateLeadForm } from "@/server/services/crm/lead-ingest";

type P = { formId: string };

export const PATCH = route<P>({}, async ({ req, params, userId }) => {
  const f = await updateLeadForm(userId ?? "", params.formId, await parseBody(req, patchLeadFormSchema));
  return { ...f, embed: embedSnippets(env().APP_URL, f.publicKey) };
});

export const DELETE = route<P>({}, async ({ params, userId }) => {
  await deleteLeadForm(userId ?? "", params.formId);
  return null;
});
