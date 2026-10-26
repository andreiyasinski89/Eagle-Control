import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { env } from "@/lib/env";

/** The shell of the privacy policy and terms: a clear "draft" notice, the responsible party from the environment, and links between the two. */
export async function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const t = await getTranslations("legal");
  const operator = env().LEGAL_OPERATOR_NAME;
  const contact = env().LEGAL_CONTACT_EMAIL;
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 py-10 text-sm leading-relaxed">
      <Link href="/sign-in" className="text-xs text-muted-foreground hover:underline">
        ← {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p role="note" className="rounded-md border border-border bg-muted/50 p-3 text-xs">
        {t("draft")}
      </p>
      <p>
        {t("operator")}: <strong>{operator ?? t("operatorMissing")}</strong>
        {contact ? ` · ${contact}` : ""}
      </p>
      {children}
      <nav className="mt-4 flex gap-4 border-t border-border pt-4 text-xs text-muted-foreground">
        <Link href="/legal/privacy" className="hover:underline">
          {t("privacy")}
        </Link>
        <Link href="/legal/terms" className="hover:underline">
          {t("terms")}
        </Link>
      </nav>
    </main>
  );
}
