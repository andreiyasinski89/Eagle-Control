import { parseBody, route } from "@/server/http/handler";
import { replaceStages, replaceStagesSchema } from "@/server/services/crm/pipelines";

export const PUT = route<{ pipelineId: string }>({}, async ({ req, params, userId }) =>
  replaceStages(userId ?? "", params.pipelineId, await parseBody(req, replaceStagesSchema)),
);
