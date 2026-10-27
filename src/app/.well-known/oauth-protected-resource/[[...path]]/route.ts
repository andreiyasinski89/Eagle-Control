import { env } from "@/lib/env";
import { oauthJson, preflight } from "@/server/http/oauth-http";

export const dynamic = "force-dynamic";
export { preflight as OPTIONS };

/** RFC 9728: tells an MCP client which server to ask for a token. Served at the bare path and at `/.well-known/…/api/mcp`. */
export function GET() {
  const base = env().APP_URL.replace(/\/$/, "");
  return oauthJson({ resource: `${base}/api/mcp`, authorization_servers: [base], bearer_methods_supported: ["header"], scopes_supported: ["read", "write"], resource_name: "MeetOwl" });
}
