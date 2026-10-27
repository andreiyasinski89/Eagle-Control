import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user?.id) return redirect({ href: "/sign-in", locale });
  const t = await getTranslations("onboarding");
  const me = await db.user.findUnique({ where: { id: session.user.id }, select: { name: true, firstName: true, lastName: true } });
  // Accounts made before the split have only a display name: split it at the first space.
  const words = (me?.name ?? "").trim().split(/\s+/).filter(Boolean);
  const firstName = me?.firstName ?? (me?.lastName ? "" : (words[0] ?? ""));
  const lastName = me?.lastName ?? (me?.firstName ? "" : words.slice(1).join(" "));
  const suggestion = firstName ? t("suggestion", { name: firstName }) : "";
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      <OnboardingForm firstName={firstName} lastName={lastName} suggestion={suggestion} />
    </main>
  );
}
