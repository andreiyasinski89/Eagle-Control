import { getTranslations } from "next-intl/server";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; callbackUrl?: string }>;
}) {
  const [t, sp] = await Promise.all([getTranslations("auth"), searchParams]);
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  // Only same-site relative callbacks, never an arbitrary URL.
  const callbackUrl = sp.callbackUrl?.startsWith("/") && !sp.callbackUrl.startsWith("//") ? sp.callbackUrl : "/";
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">🦉 {t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      {sp.sent ? (
        <p role="status" className="rounded-md border border-border bg-card p-3 text-sm">
          {t("sent")}
        </p>
      ) : (
        <SignInForm googleEnabled={googleEnabled} callbackUrl={callbackUrl} />
      )}
    </main>
  );
}
