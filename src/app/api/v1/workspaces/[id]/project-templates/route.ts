import { json, parseBody, route } from "@/server/http/handler";
import { createTemplate, createTemplateSchema, listTemplates } from "@/server/services/crm/project-templates";

type P = { id: string };

export const GET = route<P>({}, async ({ params, userId }) => listTemplates(userId ?? "", params.id));

export const POST = route<P>({}, async ({ req, params, userId }) => json(await createTemplate(userId ?? "", params.id, await parseBody(req, createTemplateSchema)), 201));
