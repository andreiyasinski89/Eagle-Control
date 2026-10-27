import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { ApiError } from "@/server/http/errors";
import { clientIp, readJson } from "@/server/http/limits";
import { rateLimit } from "@/server/http/rate-limit";
import { handleMessage } from "@/server/mcp/server";
import { authenticate } from "@/server/public-api/tokens";

export const dynamic = "force-dynamic";

const baseUrl = () => env().APP_URL.replace(/\/$/, "");
const noStore = { "cache-control": "no-store" };

/** An MCP client that gets a 401 with this header knows where to start the OAuth sign-in. */
const challenge = () => `Bearer realm="MeetOwl", resource_metadata="${baseUrl()}/.well-known/oauth-protected-resource"`;

/**
 * Model Context Protocol over Streamable HTTP, stateless: every POST is one JSON-RPC message (or a batch) and gets a JSON answer.
 * Who is calling is decided by the bearer token alone (a personal access token or an OAuth token issued for Claude).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // Before the token lookup, so a flood of bad tokens costs the database nothing.
  if (!rateLimit(`mcp:${clientIp(req.headers)}`, 600, 60_000)) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32003, message: "Too many requests" } }, { status: 429, headers: { ...noStore, "retry-after": "30" } });
  const authorization = req.headers.get("authorization");
  let token;
  try {
    token = await authenticate(authorization);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message: e.message } }, { status: 401, headers: { ...noStore, "www-authenticate": challenge() } });
    if (e instanceof ApiError) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32002, message: e.message } }, { status: e.status, headers: noStore });
    throw e;
  }

  let body: unknown;
  try {
    body = await readJson(req);
  } catch (e) {
    if (e instanceof ApiError && e.status === 413) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, { status: 413, headers: noStore });
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: noStore });
  }

  const auth = authorization as string;
  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > 20) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid batch" } }, { status: 400, headers: noStore });
    const answers = (await Promise.all(body.map((m) => handleMessage(m, token, auth)))).filter((a) => a !== null);
    return answers.length ? NextResponse.json(answers, { headers: noStore }) : new NextResponse(null, { status: 202, headers: noStore });
  }
  const answer = await handleMessage(body, token, auth);
  return answer ? NextResponse.json(answer, { headers: noStore }) : new NextResponse(null, { status: 202, headers: noStore });
}

/** No server-initiated stream: this server only answers requests. */
const notAllowed = () => new NextResponse(null, { status: 405, headers: { allow: "POST", ...noStore } });
export { notAllowed as GET, notAllowed as DELETE };
