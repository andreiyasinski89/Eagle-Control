import { json, parseBody, route } from "@/server/http/handler";
import { createCompany, createCompanySchema, listCompanies, listCompaniesSchema } from "@/server/services/crm/companies";

type P = { id: string };

export const GET = route<P>({}, async ({ req, params, userId }) =>
  listCompanies(userId ?? "", params.id, listCompaniesSchema.parse(Object.fromEntries(req.nextUrl.searchParams))),
);

export const POST = route<P>({}, async ({ req, params, userId }) => json(await createCompany(userId ?? "", params.id, await parseBody(req, createCompanySchema)), 201));
