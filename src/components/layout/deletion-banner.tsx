import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { env } from "@/lib/env";

/** Shown on every page while an account deletion is scheduled, so it cannot be forgotten. */
export async function DeletionBanner({ requestedAt }: { requestedAt: Date | null }) {
  if (!requestedAt) return null;
  const t = await getTranslations("account");
  const when = new Date(requestedAt.getTime() + env().ACCOUNT_DELETION_GRACE_DAYS * 86_400_000);
  return (
    <div role="status" data-testid="deletion-banner" className="flex items-center justify-center gap-3 bg-[var(--health-red)] px-4 py-1.5 text-sm text-white">
      {t("bannerText", { date: when.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) })}
      <Link href="/account" className="underline">
        {t("bannerCancel")}
      </Link>
    </div>
  );
}
