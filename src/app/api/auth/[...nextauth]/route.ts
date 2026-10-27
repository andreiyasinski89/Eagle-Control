import { NextResponse, type NextRequest } from "next/server";
import { handlers } from "@/server/auth";
import { clientIp } from "@/server/http/limits";
import { rateLimit } from "@/server/http/rate-limit";
import { allowSignIn } from "@/server/services/signin-guard";

export const GET = handlers.GET;

const WINDOW = 15 * 60_000;

/**
 * Sign-in is the one public door that sends e-mail, so it is limited twice: per address of the caller (anyone can
 * script a form) and per mailbox (so nobody can flood a stranger with links).
 */
export async function POST(req: NextRequest): Promise<Response> {
  if (!rateLimit(`auth:ip:${clientIp(req.headers)}`, 30, WINDOW)) return NextResponse.json({ error: { code: "rate_limited", message: "Too many attempts. Try again later." } }, { status: 429, headers: { "retry-after": "900" } });
  if (req.nextUrl.pathname.endsWith("/signin/email")) {
    const form = await req.clone().formData().catch(() => null);
    const email = String(form?.get("email") ?? "").trim().toLowerCase();
    if (email && !rateLimit(`auth:mail:${email}`, 5, WINDOW)) return NextResponse.json({ error: { code: "rate_limited", message: "Too many sign-in e-mails for this address. Try again later." } }, { status: 429, headers: { "retry-after": "900" } });
    // The terms are agreed to before a link is sent; the form sends this field only when the box is ticked.
    if (form?.get("terms") !== "1") return NextResponse.json({ error: { code: "terms_required", message: "Agree to the terms and privacy policy to continue." } }, { status: 400 });
    // A bot fills every field it sees, including the one people never see: answer as if the link was sent, send nothing.
    if (String(form?.get("website") ?? "") !== "") return NextResponse.json({ url: "/sign-in?sent=1" });
    const { isDisposableEmail } = await import("@/modules/auth/signup");
    if (email && isDisposableEmail(email)) return NextResponse.json({ error: { code: "disposable_email", message: "Use your permanent e-mail address: temporary mailboxes are not accepted." } }, { status: 400 });
    if (email && !(await allowSignIn(clientIp(req.headers), email)).ok) return NextResponse.json({ error: { code: "rate_limited", message: "Too many sign-in e-mails today. Try again tomorrow." } }, { status: 429, headers: { "retry-after": "3600" } });
    // Creating an account: what was typed (name, language, the sponsor's link) waits for the first sign-in.
    if (email && (form?.get("mode") === "signup" || form?.get("ref") || form?.get("inv"))) {
      const { saveSignupIntent } = await import("@/server/services/signup");
      await saveSignupIntent({ email, firstName: String(form?.get("firstName") ?? ""), lastName: String(form?.get("lastName") ?? ""), locale: String(form?.get("locale") ?? ""), refCode: String(form?.get("ref") ?? ""), inviteCode: String(form?.get("inv") ?? "") }).catch(() => undefined);
    } else if (email && form?.get("locale")) {
      const { saveSignupIntent } = await import("@/server/services/signup");
      await saveSignupIntent({ email, locale: String(form?.get("locale") ?? "") }).catch(() => undefined);
    }
  }
  return handlers.POST(req);
}
