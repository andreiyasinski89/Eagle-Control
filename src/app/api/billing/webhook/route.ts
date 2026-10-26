import { NextResponse, type NextRequest } from "next/server";
import { readText } from "@/server/http/limits";
import { handleStripeEvent, verifyStripeSignature } from "@/server/services/billing";

export const dynamic = "force-dynamic";

/** Stripe webhook. The raw body is read as text because the signature covers its exact bytes. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const raw = await readText(req, 512_000).catch(() => null);
  if (raw === null) return NextResponse.json({ error: "too_large" }, { status: 413 });
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"))) return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  let event: Parameters<typeof handleStripeEvent>[0];
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  try {
    return NextResponse.json({ result: await handleStripeEvent(event) });
  } catch (e) {
    console.error("stripe event failed", event.id, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "failed" }, { status: 500 }); // Stripe retries; the event id was recorded only if the write succeeded
  }
}
