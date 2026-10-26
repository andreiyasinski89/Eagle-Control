import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { googleAuthorizeUrl } from "@/server/integrations/google";

/** A plain link in the settings page: signs the person in to Google and returns to /api/integrations/google/callback. */
export const GET = route<{ id: string }>({ rateLimit: { limit: 20, windowMs: 60_000 } }, async ({ params, userId }) => NextResponse.redirect(await googleAuthorizeUrl(userId ?? "", params.id)));
