import { route } from "@/server/http/handler";
import { markAgentDraftSent } from "@/server/services/crm/agent-drafts";

type P = { draftId: string };

export const POST = route<P>({ rateLimit: { limit: 120, windowMs: 60_000 } }, async ({ params, userId }) => markAgentDraftSent(userId ?? "", params.draftId));
