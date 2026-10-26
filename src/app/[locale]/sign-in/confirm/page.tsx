import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { isSignInTarget } from "@/server/http/signin-target";

export const dynamic = "force-dynamic";

/** Landing page of the e-mailed link. It shows a button instead of signing in at once: see `confirmLink`. */
export default async function ConfirmSignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [t, sp] = await Promise.all([getTranslations("auth"), searchParams]);
  const next = sp.next ?? "";
  const valid = isSignInTarget(next);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">🦉 {t("confirmTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{valid ? t("confirmHint") : t("confirmInvalid")}</p>
      </div>
      {valid && (
        <form method="post" action="/api/signin-confirm">
          <input type="hidden" name="next" value={next} />
          <Button type="submit" data-testid="confirm-signin">
            {t("confirmButton")}
          </Button>
        </form>
      )}
    </main>
  );
}
