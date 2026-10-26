import { parseBody, route } from "@/server/http/handler";
import { leadReply, leadReplySchema } from "@/server/ai";

export const POST = route({}, async ({ req, userId }) => leadReply(userId ?? "", await parseBody(req, leadReplySchema)));
