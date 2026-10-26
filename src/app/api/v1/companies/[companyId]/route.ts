import { parseBody, route } from "@/server/http/handler";
import { archiveCompany, getCompany, patchCompanySchema, updateCompany } from "@/server/services/crm/companies";

type P = { companyId: string };

export const GET = route<P>({}, async ({ params, userId }) => getCompany(userId ?? "", params.companyId));

export const PATCH = route<P>({}, async ({ req, params, userId }) => updateCompany(userId ?? "", params.companyId, await parseBody(req, patchCompanySchema)));

export const DELETE = route<P>({}, async ({ params, userId }) => {
  await archiveCompany(userId ?? "", params.companyId);
  return null;
});
