import { NextResponse, type NextRequest } from "next/server";
import { readJson } from "@/server/http/limits";
import { handleUpdate, verifyTelegramSecret } from "@/server/integrations/telegram";

export const dynamic = "force-dynamic";

/** Telegram bot webhook. It is registered with a secret token, which Telegram repeats in this header on every call. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyTelegramSecret(req.headers.get("x-telegram-bot-api-secret-token"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const update = await readJson(req, 256_000).catch(() => null);
  await handleUpdate(update); // never throws; Telegram retries on non-2xx, so a bad message must still answer 200
  return NextResponse.json({ ok: true });
}
