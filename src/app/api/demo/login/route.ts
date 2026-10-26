import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { clientIp } from "@/server/http/limits";
import { rateLimit } from "@/server/http/rate-limit";
import { startDemoSession } from "@/server/services/demo-mode";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // the first visit builds the sample data

/**
 * "Open the demo": signs the visitor in as the demo owner. It exists only while DEMO_MODE is on (404 otherwise) and
 * hands out nothing but the shared sample workspace. The cookie is the one Auth.js reads for database sessions.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!env().DEMO_MODE) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!rateLimit(`demo:${clientIp(req.headers)}`, 30, 10 * 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { token, expires } = await startDemoSession();
  const secure = (req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "")) === "https";
  const res = new NextResponse(null, { status: 303, headers: { Location: "/" } });
  res.cookies.set({ name: secure ? "__Secure-authjs.session-token" : "authjs.session-token", value: token, expires, httpOnly: true, sameSite: "lax", secure, path: "/" });
  return res;
}
