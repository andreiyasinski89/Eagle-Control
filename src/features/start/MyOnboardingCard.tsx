"use client";

import { useQuery } from "@tanstack/react-query";
import { GraduationCap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { api } from "@/features/mindmap/api";
import type { OnboardingProgress } from "@/modules/crm/onboarding-plan";

/** For a newcomer whose mentor started the first 30 days: how far they are and the next step, with a way into the project. */
export function MyOnboardingCard({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const t = useTranslations("crm");
  const { data } = useQuery({ queryKey: ["my-onboarding", workspaceId], staleTime: 15_000, queryFn: () => api.get<{ progress: OnboardingProgress | null }>(`/api/v1/workspaces/${workspaceId}/my-onboarding`) });
  const p = data?.progress;
  if (!p) return null;
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-primary/40 bg-card p-4" data-testid="my-onboarding">
      <div className="flex items-center gap-2">
        <GraduationCap className="size-5 text-primary" aria-hidden />
        <h2 className="text-lg font-semibold">{t("onbTitle")}</h2>
        <span className="ml-auto text-xl font-semibold tabular-nums">{p.percent}%</span>
      </div>
      <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="block h-full rounded-full bg-primary" style={{ width: `${p.percent}%` }} />
      </span>
      <p className="text-sm text-muted-foreground">{p.finished ? t("onbFinishedMine") : t("onbNext", { title: p.next ?? "—", done: p.done, total: p.total })}</p>
      <Link href={`/w/${slug}/projects/p/${p.projectId}`} className="inline-flex min-h-11 w-fit items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground" data-testid="my-onboarding-open">
        {t("onbOpenMine")}
      </Link>
    </section>
  );
}
