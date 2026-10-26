import { NextResponse, type NextRequest } from "next/server";
import { readText } from "@/server/http/limits";
import { handleSlackEvent, verifySlackSignature } from "@/server/integrations/slack";

export const dynamic = "force-dynamic";

/** Slack Events API. The raw body is read as text because the signature covers its exact bytes. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = await readText(req, 512_000).catch(() => null);
  if (raw === null) return NextResponse.json({ error: "too_large" }, { status: 413 });
  if (!verifySlackSignature(raw, req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"))) return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  let body: Parameters<typeof handleSlackEvent>[0];
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  return NextResponse.json(await handleSlackEvent(body));
}
