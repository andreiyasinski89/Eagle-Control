import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { ApiError } from "@/server/http/errors";
import { route } from "@/server/http/handler";
import { issueCode, OAuthError, validateAuthorize } from "@/server/services/oauth";

const PARAMS = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const;

function back(redirectUri: string, state: string | undefined, extra: Record<string, string>): NextResponse {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  if (state) url.searchParams.set("state", state);
  return NextResponse.redirect(url, 303);
}

/**
 * The consent form posts here. Cookies authenticate the person, so this must be a real click on our own page:
 * a form from another site is refused by the Origin check (and the session cookie is SameSite=Lax as well).
 * Everything the form carried is validated again; hidden fields are only a convenience.
 */
export const POST = route({ rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ req, userId }) => {
  const appOrigin = new URL(env().APP_URL).origin;
  if (req.headers.get("origin") !== appOrigin) throw new ApiError(403, "bad_origin", "This form must be sent from MeetOwl");

  const form = await readForm(req);
  const raw: Record<string, string> = {};
  for (const k of PARAMS) {
    const v = form.get(k);
    if (typeof v === "string") raw[k] = v;
  }
  const v = await validateAuthorize(raw, appOrigin); // a bad client or redirect address stops here: nowhere safe to send the person back to
  const state = v.params.state;

  if (form.get("decision") !== "allow") return back(v.params.redirect_uri, state, { error: "access_denied", error_description: "The person declined" });
  const workspaceId = form.get("workspaceId");
  const scope = form.get("scope") === "read" ? "read" : "write";
  if (typeof workspaceId !== "string" || !workspaceId) return back(v.params.redirect_uri, state, { error: "invalid_request", error_description: "No workspace was chosen" });
  try {
    const code = await issueCode(userId ?? "", v, workspaceId, scope);
    return back(v.params.redirect_uri, state, { code });
  } catch (e) {
    if (e instanceof OAuthError || e instanceof ApiError) return back(v.params.redirect_uri, state, { error: "access_denied", error_description: "This workspace cannot be connected" });
    throw e;
  }
});

async function readForm(req: NextRequest): Promise<FormData> {
  try {
    return await req.formData();
  } catch {
    throw new ApiError(400, "invalid_form", "Send the consent form");
  }
}
