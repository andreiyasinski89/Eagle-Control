import { getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { env } from "@/lib/env";

const FEATURES = ["f1", "f2", "f3", "f4", "f5", "f6"] as const;

/**
 * The public front page for someone who is not signed in: what MLM CRM is, the way in, and the policies. Google (for the Calendar permission)
 * and Google Play both ask for a home page that describes the app and links the privacy policy without signing in.
 */
export async function Landing() {
  const t = await getTranslations("landing");
  const operator = env().LEGAL_OPERATOR_NAME;
  const contact = env().LEGAL_CONTACT_EMAIL;
  return (
    <main className="min-h-screen bg-background" data-testid="landing">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-4">
        <BrandLogo className="text-lg font-semibold" />
        <Button asChild size="sm" variant="outline">
          <Link href="/sign-in">{t("signIn")}</Link>
        </Button>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-10 pt-8 md:pt-16">
        <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight md:text-5xl">{t("title")}</h1>
        <p className="max-w-2xl text-base text-muted-foreground md:text-lg">{t("lead")}</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild className="min-h-12 px-6 text-base">
            <Link href="/sign-in?tab=signup">{t("start")}</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-12 px-6 text-base">
            <Link href="/sign-in">{t("signIn")}</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-3 px-4 pb-12 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((k) => (
          <div key={k} className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold">{t(`${k}Title`)}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{t(`${k}Text`)}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground md:flex-row md:flex-wrap md:items-center md:gap-x-5">
          <span>
            © MLM CRM{operator ? ` · ${operator}` : ""}
            {contact ? ` · ${contact}` : ""}
          </span>
          <Link href="/legal/privacy" className="hover:underline">
            {t("privacy")}
          </Link>
          <Link href="/legal/terms" className="hover:underline">
            {t("terms")}
          </Link>
          <Link href="/legal/delete-account" className="hover:underline">
            {t("deleteAccount")}
          </Link>
        </div>
      </footer>
    </main>
  );
}
