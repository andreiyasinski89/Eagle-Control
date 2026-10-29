"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/features/mindmap/api";
import { MAX_STEPS, PLAN_DAYS, type OnboardingStep } from "@/modules/crm/onboarding-plan";

interface PlanData {
  steps: OnboardingStep[];
  custom: boolean;
  canChange: boolean;
}

/** The steps of the first 30 days of a new partner. Everybody sees them; owners and admins change them (a project already started keeps its own steps). */
export function OnboardingPlanPanel({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  const qc = useQueryClient();
  const key = ["onboarding-plan", workspaceId, locale];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<PlanData>(`/api/v1/workspaces/${workspaceId}/onboarding-plan?locale=${locale}`) });
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (data) setSteps(data.steps);
  }, [data]);

  const save = useMutation({
    mutationFn: (next: OnboardingStep[] | null) => api.put<PlanData>(`/api/v1/workspaces/${workspaceId}/onboarding-plan`, { steps: next, locale }),
    onSuccess: (r) => {
      qc.setQueryData(key, r);
      setNote(t("onbPlanSaved"));
    },
    onError: () => setNote(t("error")),
  });
  if (!data) return null;
  const edit = data.canChange;
  const patch = (i: number, p: Partial<OnboardingStep>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const valid = steps.length > 0 && steps.every((s) => s.title.trim());

  return (
    <section className="rounded-lg border border-border bg-card p-4" data-testid="onboarding-plan">
      <h2 className="text-base font-semibold">{t("onbPlanTitle")}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{t("onbPlanHint")}</p>
      <ul className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <li key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_5rem_5rem_auto_auto] sm:items-center" data-testid="onboarding-step">
            <Input aria-label={t("onbStepTitle")} className="col-span-2 h-11 sm:col-span-1 sm:h-9" value={s.title} maxLength={120} disabled={!edit} onChange={(e) => patch(i, { title: e.target.value })} data-testid="onb-title" />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {t("onbDay")}
              <Input type="number" inputMode="numeric" min={0} max={PLAN_DAYS - 1} className="h-11 w-full sm:h-9" value={s.day} disabled={!edit} onChange={(e) => patch(i, { day: Number(e.target.value) })} data-testid="onb-day" />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {t("onbDays")}
              <Input type="number" inputMode="numeric" min={1} max={PLAN_DAYS} className="h-11 w-full sm:h-9" value={s.days} disabled={!edit} onChange={(e) => patch(i, { days: Number(e.target.value) })} data-testid="onb-days" />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
              <input type="checkbox" className="size-5" checked={s.checkpoint} disabled={!edit} onChange={(e) => patch(i, { checkpoint: e.target.checked })} data-testid="onb-checkpoint" />
              {t("onbCheckpoint")}
            </label>
            <button type="button" aria-label={t("onbStepRemove")} className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:hidden justify-self-end sm:size-9" disabled={!edit} onClick={() => setSteps((x) => x.filter((_, j) => j !== i))} data-testid="onb-remove">
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      {edit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11" disabled={steps.length >= MAX_STEPS} onClick={() => setSteps((s) => [...s, { title: "", day: 0, days: 1, checkpoint: false }])} data-testid="onb-add">
            <Plus className="size-4" />
            {t("onbAddStep")}
          </Button>
          <Button type="button" className="min-h-11" disabled={!valid || save.isPending} onClick={() => (setNote(null), save.mutate(steps.map((s) => ({ ...s, title: s.title.trim() }))))} data-testid="onb-save">
            {t("teamMapSave")}
          </Button>
          {data.custom && (
            <Button type="button" variant="ghost" className="min-h-11" disabled={save.isPending} onClick={() => (setNote(null), save.mutate(null))} data-testid="onb-reset">
              {t("onbReset")}
            </Button>
          )}
        </div>
      )}
      {!edit && <p className="mt-2 text-xs text-muted-foreground">{t("onbPlanOwnerOnly")}</p>}
      {note && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {note}
        </p>
      )}
    </section>
  );
}
