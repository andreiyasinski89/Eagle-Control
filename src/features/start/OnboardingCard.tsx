"use client";

import { ArrowRight, Rocket } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { stepHref } from "@/modules/onboarding/steps";
import { useOnboarding } from "./useOnboarding";

/** A line at the top of My day while getting started is not finished: how far, what is next, and where to do it. */
export function OnboardingCard({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const t = useTranslations("start");
  const { data } = useOnboarding(workspaceId);
  if (!data || data.hidden || data.percent >= 100) return null;
  const next = data.steps.find((s) => s.id === data.next);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3.5" data-testid="onboarding-card">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary" aria-hidden>
        <Rocket className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          {t("cardTitle", { done: data.done, total: data.required })}
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-background" aria-hidden>
            <span className="block h-full rounded-full bg-primary" style={{ width: `${data.percent}%` }} />
          </span>
        </div>
        {next && <p className="truncate text-sm text-muted-foreground">{t("cardNext", { step: t(`step.${next.id as "profile"}.title`) })}</p>}
      </div>
      {next && (
        <Button asChild size="sm" variant="outline">
          <Link href={stepHref(slug, next.path)}>
            {t("open")}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      )}
      <Button asChild size="sm">
        <Link href={`/w/${slug}/start`} data-testid="onboarding-all">
          {t("allSteps")}
        </Link>
      </Button>
    </div>
  );
}
