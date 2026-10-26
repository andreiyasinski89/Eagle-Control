import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { readJson } from "@/server/http/limits";
import { dispatch } from "@/server/public-api/dispatch";
import { openApiDocument } from "@/server/public-api/openapi";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }): Promise<NextResponse> {
  const segments = (await ctx.params).path ?? [];
  const path = `/${segments.join("/")}`;
  // The document is public on purpose: it describes the API, not anyone's data.
  if (req.method === "GET" && path === "/openapi.json") return NextResponse.json(openApiDocument(env().APP_URL.replace(/\/$/, "")));
  const res = await dispatch(req.method, path, req.nextUrl.searchParams, req.headers, () => readJson(req));
  return NextResponse.json(res.body, { status: res.status, headers: { ...res.headers, "cache-control": "no-store" } });
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
