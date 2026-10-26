import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/server/integrations/common";
import { handlers, run, type JobName } from "@/server/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Runs one background job on request, for installations without Inngest: point any scheduler (cron, a cloud scheduler,
 * Vercel Cron) at it with `Authorization: Bearer <CRON_SECRET>`. Disabled (404) until CRON_SECRET is set.
 */
async function handle(req: NextRequest, ctx: { params: Promise<{ name: string }> }): Promise<NextResponse> {
  const secret = env().CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!given || !safeEqual(given, secret)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const name = decodeURIComponent((await ctx.params).name).replace("~", "/"); // job names contain a slash: use "calendar~poll" in the URL
  if (!Object.prototype.hasOwnProperty.call(handlers, name)) return NextResponse.json({ error: "unknown_job", jobs: Object.keys(handlers).map((j) => j.replace("/", "~")) }, { status: 404 });
  try {
    return NextResponse.json({ job: name, result: await run(name as JobName, {}) });
  } catch (e) {
    console.error("job failed", name, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "job_failed" }, { status: 500 });
  }
}

export { handle as GET, handle as POST };
