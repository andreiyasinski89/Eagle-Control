import { route } from "@/server/http/handler";
import { getTree } from "@/server/services/nodes/queries";

export const GET = route<{ projectId: string }>({}, async ({ params, userId }) => getTree(userId ?? "", params.projectId));
