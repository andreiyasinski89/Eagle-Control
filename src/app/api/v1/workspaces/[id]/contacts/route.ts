import { json, parseBody, route } from "@/server/http/handler";
import { createContact, createContactSchema, listContacts, listContactsSchema } from "@/server/services/crm/contacts";

type P = { id: string };

export const GET = route<P>({}, async ({ req, params, userId }) =>
  listContacts(userId ?? "", params.id, listContactsSchema.parse(Object.fromEntries(req.nextUrl.searchParams))),
);

export const POST = route<P>({}, async ({ req, params, userId }) => json(await createContact(userId ?? "", params.id, await parseBody(req, createContactSchema)), 201));
