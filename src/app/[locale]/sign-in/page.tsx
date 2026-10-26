import { getTranslations } from "next-intl/server";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; callbackUrl?: string }>;
}) {
  const [t, sp] = await Promise.all([getTranslations("auth"), searchParams]);
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  // Only same-site relative callbacks, never an arbitrary URL.
  const demo = env().DEMO_MODE;
  // A public demo may have no mail service: then the demo button is the only way in.
  const mailEnabled = !demo || Boolean(process.env.RESEND_API_KEY);
  const callbackUrl = sp.callbackUrl?.startsWith("/") && !sp.callbackUrl.startsWith("//") ? sp.callbackUrl : "/";
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
          <div>
            <span className="text-lg font-semibold lg:hidden">🦉 MeetOwl</span>
            <h1 className="mt-6 text-2xl font-semibold tracking-tight lg:mt-0">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          {sp.sent ? (
            <p role="status" className="rounded-xl border border-border bg-card p-4 text-sm">
              {t("sent")}
            </p>
          ) : (
            <>
              {demo && (
                <form method="post" action="/api/demo/login" className="flex flex-col gap-2" data-testid="demo-login">
                  <Button type="submit">{t("demo")}</Button>
                  <p className="text-xs text-muted-foreground">{t("demoNote")}</p>
                </form>
              )}
              {mailEnabled && <SignInForm googleEnabled={googleEnabled} callbackUrl={callbackUrl} />}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
