import { z } from "zod";
import { json, parseBody, route } from "@/server/http/handler";
import { saveProjectAsTemplate } from "@/server/services/crm/project-templates";

export const POST = route<{ projectId: string }>({}, async ({ req, params, userId }) => {
  const { name } = await parseBody(req, z.object({ name: z.string().trim().min(1).max(80) }));
  const t = await saveProjectAsTemplate(userId ?? "", params.projectId, name);
  return json({ id: t.id, name: t.name }, 201);
});
