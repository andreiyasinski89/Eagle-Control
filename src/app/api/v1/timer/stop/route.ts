import { route } from "@/server/http/handler";
import { stopTimer } from "@/server/services/time";

export const POST = route({}, async ({ userId }) => stopTimer(userId ?? ""));
