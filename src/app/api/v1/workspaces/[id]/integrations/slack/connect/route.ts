import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { slackAuthorizeUrl } from "@/server/integrations/slack";

export const GET = route<{ id: string }>({ rateLimit: { limit: 20, windowMs: 60_000 } }, async ({ params, userId }) => NextResponse.redirect(await slackAuthorizeUrl(userId ?? "", params.id)));
