import { z } from "zod";
import { parseBody, route } from "@/server/http/handler";
import { deletePipeline, renamePipeline } from "@/server/services/crm/pipelines";

type P = { pipelineId: string };

const patch = z.object({ name: z.string().trim().min(1).max(60).optional(), isDefault: z.boolean().optional() });

export const PATCH = route<P>({}, async ({ req, params, userId }) => renamePipeline(userId ?? "", params.pipelineId, await parseBody(req, patch)));

export const DELETE = route<P>({}, async ({ params, userId }) => {
  await deletePipeline(userId ?? "", params.pipelineId);
  return null;
});
