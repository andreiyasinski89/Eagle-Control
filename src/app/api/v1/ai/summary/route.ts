import { parseBody, route } from "@/server/http/handler";
import { summarize, summarySchema } from "@/server/ai";

export const POST = route({}, async ({ req, userId }) => summarize(userId ?? "", await parseBody(req, summarySchema)));
