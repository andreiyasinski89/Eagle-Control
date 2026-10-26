import { env } from "@/lib/env";
import { json, parseBody, route } from "@/server/http/handler";
import { createLeadForm, embedSnippets, leadFormSchema, listLeadForms } from "@/server/services/crm/lead-ingest";

type P = { id: string };

const withEmbed = <T extends { publicKey: string }>(f: T) => ({ ...f, embed: embedSnippets(env().APP_URL, f.publicKey) });

export const GET = route<P>({}, async ({ params, userId }) => (await listLeadForms(userId ?? "", params.id)).map(withEmbed));

export const POST = route<P>({}, async ({ req, params, userId }) => json(withEmbed(await createLeadForm(userId ?? "", params.id, await parseBody(req, leadFormSchema))), 201));
