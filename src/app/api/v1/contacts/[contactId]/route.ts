import { parseBody, route } from "@/server/http/handler";
import { archiveContact, getContact, patchContactSchema, updateContact } from "@/server/services/crm/contacts";

type P = { contactId: string };

export const GET = route<P>({}, async ({ params, userId }) => getContact(userId ?? "", params.contactId));

export const PATCH = route<P>({}, async ({ req, params, userId }) => updateContact(userId ?? "", params.contactId, await parseBody(req, patchContactSchema)));

export const DELETE = route<P>({}, async ({ params, userId }) => {
  await archiveContact(userId ?? "", params.contactId);
  return null;
});
