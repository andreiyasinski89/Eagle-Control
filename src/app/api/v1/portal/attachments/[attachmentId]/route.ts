import { NextResponse } from "next/server";
import { route } from "@/server/http/handler";
import { portalDownloadUrl } from "@/server/services/portal";

export const GET = route<{ attachmentId: string }>({ rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ params, userId }) => NextResponse.redirect(await portalDownloadUrl(userId ?? "", params.attachmentId)));
