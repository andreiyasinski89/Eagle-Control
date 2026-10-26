import { route } from "@/server/http/handler";
import { getPortalProject } from "@/server/services/portal";

export const GET = route<{ projectId: string }>({}, async ({ params, userId }) => getPortalProject(userId ?? "", params.projectId));
