import { route } from "@/server/http/handler";
import { stepUpStatus } from "@/server/services/admin-stepup";

export const GET = route({}, async ({ userId }) => stepUpStatus(userId ?? ""));
