import { parseBody, route } from "@/server/http/handler";
import { startTimer, startTimerSchema } from "@/server/services/time";

export const POST = route({}, async ({ req, userId }) => startTimer(userId ?? "", await parseBody(req, startTimerSchema)));
