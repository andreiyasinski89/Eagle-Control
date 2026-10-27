import { route } from "@/server/http/handler";
import { listMyTasks } from "@/server/services/nodes/my-tasks";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => listMyTasks(userId ?? "", params.id));
