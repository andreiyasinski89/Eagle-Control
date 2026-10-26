import { z } from "zod";
import { parseBody, route } from "@/server/http/handler";
import { markRead } from "@/server/services/notify";

const schema = z.object({ ids: z.array(z.string()).max(200).optional(), all: z.boolean().optional(), workspaceId: z.string().optional() }).refine((v) => v.all || (v.ids?.length ?? 0) > 0, "Nothing to mark");

export const POST = route({}, async ({ req, userId }) => markRead(userId ?? "", await parseBody(req, schema)));
