import { route } from "@/server/http/handler";
import { boardSchema, getBoard } from "@/server/services/crm/deals";

export const GET = route<{ pipelineId: string }>({}, async ({ req, params, userId }) =>
  getBoard(userId ?? "", params.pipelineId, boardSchema.parse(Object.fromEntries(req.nextUrl.searchParams))),
);
