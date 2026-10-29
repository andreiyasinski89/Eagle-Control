import { NextResponse, type NextRequest } from "next/server";
import { guard } from "@/server/http/public";
import { resolveShare } from "@/server/services/crm/materials";

export const dynamic = "force-dynamic";

/** The link given to the people a material is sent to: it leads to the outside page or shows the file. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    guard(req, "material-get", 120);
  } catch {
    return new NextResponse("Too many requests", { status: 429 });
  }
  const target = await resolveShare((await params).key);
  if (!target) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(target.url, { status: 302, headers: { "referrer-policy": "no-referrer", "cache-control": "no-store" } });
}
