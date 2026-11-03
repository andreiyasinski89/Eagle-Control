import { route } from "@/server/http/handler";
import { rejectAgentDraft } from "@/server/services/crm/agent-drafts";

type P = { draftId: string };

export const POST = route<P>({}, async ({ params, userId }) => rejectAgentDraft(userId ?? "", params.draftId));
