import { route } from "@/server/http/handler";
import { listAgentDrafts, listDraftsSchema } from "@/server/services/crm/agent-drafts";

type P = { id: string };

export const GET = route<P>({}, async ({ req, params, userId }) => listAgentDrafts(userId ?? "", params.id, listDraftsSchema.parse(Object.fromEntries(req.nextUrl.searchParams))));
