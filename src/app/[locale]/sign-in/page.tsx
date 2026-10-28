import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { auth } from "@/server/auth";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { isRefCode } from "@/modules/auth/signup";
import { inviteInfo, referralInfo } from "@/server/services/signup";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; callbackUrl?: string; tab?: string; ref?: string; inv?: string }>;
}) {
  const [t, sp] = await Promise.all([getTranslations("auth"), searchParams]);
  // The link was opened twice (a mail preview, a double click): if the first time worked, the person is already in.
  if (sp.error && (await auth())?.user) redirect({ href: "/", locale: await getLocale() });
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  // Only same-site relative callbacks, never an arbitrary URL.
  const demo = env().DEMO_MODE;
  // A public demo may have no mail service: then the demo button is the only way in.
  const mailEnabled = !demo || Boolean(process.env.RESEND_API_KEY);
  const callbackUrl = sp.callbackUrl?.startsWith("/") && !sp.callbackUrl.startsWith("//") ? sp.callbackUrl : "/";
  // An invitation link: only a code that exists counts, and only the inviter's name is shown.
  const refCode = isRefCode(sp.ref) ? sp.ref : null;
  const inviter = refCode ? ((await referralInfo(refCode).catch(() => null))?.inviter ?? null) : null;
  const validRef = inviter ? refCode : null;
  // A platform invitation (/i/<code>): the person comes to use MeetOwl themselves.
  const invCode = isRefCode(sp.inv) ? sp.inv : null;
  const platformInviter = invCode ? ((await inviteInfo(invCode).catch(() => null))?.inviter ?? null) : null;
  const validInv = platformInviter ? invCode : null;
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside
        className="relative hidden flex-col justify-between overflow-hidden bg-[hsl(263_65%_36%)] p-12 text-white lg:flex"
        style={{ backgroundImage: "radial-gradient(circle at 15% 10%, color-mix(in srgb, white 22%, transparent), transparent 45%), radial-gradient(circle at 90% 95%, color-mix(in srgb, black 25%, transparent), transparent 50%)" }}
      >
        <span className="text-xl font-semibold tracking-tight">🦉 MeetOwl</span>
        <div className="max-w-md">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight">{t("tagline")}</h2>
          <ul className="mt-8 flex flex-col gap-4 text-base opacity-95">
            {(["point1", "point2", "point3"] as const).map((k) => (
              <li key={k} className="flex items-start gap-3">
                <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/20 text-sm">
                  ✓
                </span>
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
        <span className="text-sm opacity-70">{t("footer")}</span>
      </aside>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <span className="text-lg font-semibold lg:hidden">🦉 MeetOwl</span>
          {sp.sent ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
              <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm">
                {t("sent")}
              </p>
            </>
          ) : (
            <>
              {sp.error && (
                <p role="alert" className="rounded-xl border border-border bg-card p-4 text-sm" data-error={sp.error}>
                  {sp.error === "Verification" ? t("linkError") : sp.error === "AccessDenied" ? t("accessDenied") : t("signInFailed", { code: sp.error })}
                </p>
              )}
              {mailEnabled && <SignInForm googleEnabled={googleEnabled} callbackUrl={callbackUrl} initialMode={sp.tab === "signup" || validRef || validInv ? "signup" : "signin"} refCode={validRef} inviter={inviter} invCode={validInv} platformInviter={platformInviter} />}
              {demo && (
                <form method="post" action="/api/demo/login" className="flex flex-col gap-2" data-testid="demo-login">
                  <Button type="submit" variant={mailEnabled ? "outline" : "primary"}>
                    {t("demo")}
                  </Button>
                  <p className="text-xs text-muted-foreground">{t("demoNote")}</p>
                </form>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
