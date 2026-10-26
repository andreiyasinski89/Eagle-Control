import { json, parseBody, route } from "@/server/http/handler";
import { applyBreakdown, applyBreakdownSchema } from "@/server/ai";

export const POST = route({}, async ({ req, userId }) => json(await applyBreakdown(userId ?? "", await parseBody(req, applyBreakdownSchema)), 201));
