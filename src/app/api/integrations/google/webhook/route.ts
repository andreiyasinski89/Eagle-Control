import { NextResponse, type NextRequest } from "next/server";
import { handleGoogleWebhook } from "@/server/integrations/google";

export const dynamic = "force-dynamic";

/** Google Calendar push notification: headers only, no body. Always 200 so Google does not retry a call we ignored. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const h = req.headers;
  await handleGoogleWebhook({ channelId: h.get("x-goog-channel-id"), token: h.get("x-goog-channel-token"), state: h.get("x-goog-resource-state") }).catch((e) => console.error("google webhook failed", e instanceof Error ? e.message : e));
  return NextResponse.json({ ok: true });
}
