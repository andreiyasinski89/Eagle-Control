import { route } from "@/server/http/handler";
import { listActivity } from "@/server/services/nodes/queries";

export const GET = route<{ nodeId: string }>({}, async ({ params, userId }) => listActivity(userId ?? "", params.nodeId));
