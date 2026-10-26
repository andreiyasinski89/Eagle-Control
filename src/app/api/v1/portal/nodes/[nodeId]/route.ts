import { route } from "@/server/http/handler";
import { getPortalNode } from "@/server/services/portal";

export const GET = route<{ nodeId: string }>({}, async ({ params, userId }) => getPortalNode(userId ?? "", params.nodeId));
