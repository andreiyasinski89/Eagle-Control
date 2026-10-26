import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { googleCallback } from "@/server/integrations/google";
import { appUrl } from "@/server/integrations/common";

export const dynamic = "force-dynamic";

/** Google sends the person back here. Whatever happens, they land on the settings page with the outcome in the URL. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const session = await auth();
  const back = (slug: string, q: string) => NextResponse.redirect(`${appUrl()}/w/${slug}/settings/integrations?${q}`);
  try {
    if (!session?.user?.id) return NextResponse.redirect(`${appUrl()}/sign-in`);
    if (sp.get("error") || !sp.get("code")) throw new ApiError(400, "denied", "Google access was not granted");
    const { workspaceId } = await googleCallback(sp.get("code") as string, sp.get("state"), session.user.id);
    const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { slug: true } });
    return back(ws.slug, "connected=google");
  } catch (e) {
    const slug = (await db.membership.findFirst({ where: { userId: session?.user?.id ?? "" }, select: { workspace: { select: { slug: true } } } }))?.workspace.slug;
    return slug ? back(slug, `error=${encodeURIComponent(e instanceof ApiError ? e.code : "google_failed")}`) : NextResponse.redirect(`${appUrl()}/`);
  }
}
