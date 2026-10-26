import { NextResponse, type NextRequest } from "next/server";
import { isSignInTarget } from "@/server/http/signin-target";

/** The button on the confirmation page: a POST (which mail scanners do not make) that forwards to the one-time sign-in link. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const next = String((await req.formData().catch(() => null))?.get("next") ?? "");
  if (!isSignInTarget(next)) return NextResponse.json({ error: "invalid_link" }, { status: 400 });
  return new NextResponse(null, { status: 303, headers: { Location: next } });
}
