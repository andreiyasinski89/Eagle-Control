import { route } from "@/server/http/handler";
import { projectBlockLinks } from "@/server/services/nodes/views";

export const GET = route<{ projectId: string }>({}, async ({ params, userId }) => projectBlockLinks(userId ?? "", params.projectId));
