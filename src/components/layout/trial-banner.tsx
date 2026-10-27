import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { entitlementOf } from "@/server/services/entitlements";

/** For the owner of a workspace that has Pro only because of the 14-day trial: how many days are left, and the way to keep it. */
export async function TrialBanner({ workspaceId, slug, isOwner }: { workspaceId: string; slug: string; isOwner: boolean }) {
  if (!isOwner) return null;
  const e = await entitlementOf(workspaceId);
  if (e.trialDaysLeft === null) return null;
  const t = await getTranslations("billing");
  const urgent = e.trialDaysLeft <= 3;
  return (
    <div role="status" data-testid="trial-banner" className={urgent ? "flex flex-wrap items-center justify-center gap-3 bg-[var(--health-yellow)] px-4 py-1.5 text-sm text-black" : "flex flex-wrap items-center justify-center gap-3 bg-primary/15 px-4 py-1.5 text-sm"}>
      {t("trialBanner", { n: e.trialDaysLeft })}
      <Link href={`/w/${slug}/settings/billing`} className="font-medium underline">
        {t("trialChoose")}
      </Link>
    </div>
  );
}
