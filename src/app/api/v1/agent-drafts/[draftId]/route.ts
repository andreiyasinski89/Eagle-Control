import { parseBody, route } from "@/server/http/handler";
import { editAgentDraft, editDraftSchema } from "@/server/services/crm/agent-drafts";

type P = { draftId: string };

export const PATCH = route<P>({}, async ({ req, params, userId }) => editAgentDraft(userId ?? "", params.draftId, await parseBody(req, editDraftSchema)));
