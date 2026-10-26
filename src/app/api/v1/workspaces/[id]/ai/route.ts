import { route } from "@/server/http/handler";
import { aiStatus } from "@/server/ai";

export const GET = route<{ id: string }>({}, async ({ params, userId }) => aiStatus(userId ?? "", params.id));
