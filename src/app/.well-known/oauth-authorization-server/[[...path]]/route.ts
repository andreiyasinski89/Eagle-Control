import { env } from "@/lib/env";
import { oauthJson, preflight } from "@/server/http/oauth-http";

export const dynamic = "force-dynamic";
export { preflight as OPTIONS };

/** RFC 8414 metadata. */
export function GET() {
  const base = env().APP_URL.replace(/\/$/, "");
  return oauthJson({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["read", "write"],
  });
}
