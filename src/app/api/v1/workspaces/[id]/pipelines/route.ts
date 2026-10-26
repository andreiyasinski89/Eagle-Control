import { json, parseBody, route } from "@/server/http/handler";
import { createPipeline, createPipelineSchema, listPipelines } from "@/server/services/crm/pipelines";

type P = { id: string };

export const GET = route<P>({}, async ({ params, userId }) => listPipelines(userId ?? "", params.id));

export const POST = route<P>({}, async ({ req, params, userId }) => {
  const input = await parseBody(req, createPipelineSchema);
  return json(await createPipeline(userId ?? "", params.id, input), 201);
});
