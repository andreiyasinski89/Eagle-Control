import { parseBody, route } from "@/server/http/handler";
import { ask, askSchema } from "@/server/ai";

export const POST = route({}, async ({ req, userId }) => ask(userId ?? "", await parseBody(req, askSchema)));
