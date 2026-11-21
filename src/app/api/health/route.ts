import { NextResponse } from "next/server";
import { healthReason } from "@/lib/health-reason";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const t0 = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "up" });
  } catch (e) {
    const reason = healthReason(e);
    console.error("health: database check failed", reason, e instanceof Error ? e.name : typeof e);
    return NextResponse.json({ status: "degraded", db: "down", reason, waitedMs: Date.now() - t0 }, { status: 503 });
  }
}
