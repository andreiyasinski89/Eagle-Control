import { z } from "zod";
import { json, parseBody, route } from "@/server/http/handler";
import { createProject } from "@/server/services/nodes/ops";
import { nodeDto } from "@/server/services/nodes/batch";
import { listProjects } from "@/server/services/nodes/queries";

type P = { id: string };

export const GET = route<P>({}, async ({ params, userId }) => listProjects(userId ?? "", params.id));

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(5000).nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  template: z.enum(["empty", "agile-sprint-map", "product-roadmap", "agency-client-project"]).default("empty"),
  templateId: z.string().optional(),
  estimationUnit: z.enum(["HOURS", "STORY_POINTS"]).default("HOURS"),
});

export const POST = route<P>({ rateLimit: { limit: 20, windowMs: 60_000 } }, async ({ req, params, userId }) => {
  const input = await parseBody(req, createSchema);
  const { project, changes } = await createProject(userId ?? "", params.id, input);
  return json({ project: nodeDto(project), changes }, 201);
});
