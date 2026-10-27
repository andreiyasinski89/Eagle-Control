import type { NextRequest } from "next/server";
import { clientIp, readJson } from "@/server/http/limits";
import { rateLimit } from "@/server/http/rate-limit";
import { oauthFailure, oauthJson, preflight } from "@/server/http/oauth-http";
import { OAuthError, registerClient, registerSchema } from "@/server/services/oauth";

export const dynamic = "force-dynamic";
export { preflight as OPTIONS };

/** Dynamic client registration (RFC 7591), the way Claude and other MCP clients introduce themselves. */
export async function POST(req: NextRequest) {
  try {
    if (!rateLimit(`oauth-register:${clientIp(req.headers)}`, 20, 3_600_000)) throw new OAuthError("server_error", "Too many registrations; try again later", 429);
    const body = registerSchema.parse(await readJson(req, 20_000));
    return oauthJson(await registerClient(body), 201);
  } catch (e) {
    return oauthFailure(e);
  }
}
