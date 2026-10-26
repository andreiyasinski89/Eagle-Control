import { parseBody, route } from "@/server/http/handler";
import { breakdown, breakdownSchema } from "@/server/ai";

export const POST = route({}, async ({ req, userId }) => breakdown(userId ?? "", await parseBody(req, breakdownSchema)));
