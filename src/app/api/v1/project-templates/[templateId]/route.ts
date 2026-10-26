import { route } from "@/server/http/handler";
import { deleteTemplate } from "@/server/services/crm/project-templates";

export const DELETE = route<{ templateId: string }>({}, async ({ params, userId }) => {
  await deleteTemplate(userId ?? "", params.templateId);
  return null;
});
