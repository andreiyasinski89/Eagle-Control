"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Circle, MinusCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, textareaClass } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { api } from "@/features/mindmap/api";
import { stepHref, type Block } from "@/modules/onboarding/steps";
import { cn } from "@/lib/utils";
import { MyOnboardingCard } from "./MyOnboardingCard";
import { useOnboarding, type GoalDto, type OnboardingData, type StartStep } from "./useOnboarding";

const num = (v: string): number | null => (v.trim() === "" ? null : Math.max(0, Math.min(100_000, Math.round(Number(v)) || 0)));

/**
 * Getting started: where you stand from the first login to a working day. The steps tick themselves from what you have done;
 * the dream you write down is measured against the clients and partners you win.
 */
export function StartView({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const t = useTranslations("start");
  const qc = useQueryClient();
  const { data, isLoading } = useOnboarding(workspaceId);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["onboarding", workspaceId] });
  const skip = useMutation({ mutationFn: (v: { step: string; skipped: boolean }) => api.post(`/api/v1/workspaces/${workspaceId}/onboarding/skip`, v), onSuccess: refresh });
  const hide = useMutation({ mutationFn: (hidden: boolean) => api.post(`/api/v1/workspaces/${workspaceId}/onboarding/hide`, { hidden }), onSuccess: refresh });

  if (isLoading || !data) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-8">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const blocks: Block[] = ["platform", "business"];
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 p-4 md:p-8" data-testid="start-view">
      <header className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
          <span className="text-3xl font-semibold tabular-nums" data-testid="start-percent">
            {data.percent}%
          </span>
        </div>
        <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${data.percent}%` }} />
        </span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span data-testid="start-progress">{t("progress", { done: data.done, total: data.required })}</span>
          {data.percent >= 100 && <span className="text-[var(--health-green)]">{t("allDone")}</span>}
          <button type="button" className="ml-auto text-primary hover:underline" onClick={() => hide.mutate(!data.hidden)} data-testid="start-hide">
            {data.hidden ? t("show") : t("hide")}
          </button>
        </div>
      </header>

      <MyOnboardingCard workspaceId={workspaceId} slug={slug} />

      <DreamCard workspaceId={workspaceId} data={data} onSaved={refresh} />

      {blocks.map((b) => {
        const steps = data.steps.filter((s) => s.block === b);
        if (steps.length === 0) return null;
        return (
          <section key={b} className="flex flex-col gap-2" data-testid={`block-${b}`}>
            <div>
              <h2 className="text-lg font-semibold">{b === "platform" ? t("blockPlatform") : t("blockBusiness")}</h2>
              <p className="text-sm text-muted-foreground">{b === "platform" ? t("blockPlatformHint") : t("blockBusinessHint")}</p>
            </div>
            <ul className="flex flex-col gap-2">
              {steps.map((s) => (
                <StepCard key={s.id} step={s} slug={slug} isNext={data.next === s.id} onSkip={(skipped) => skip.mutate({ step: s.id, skipped })} />
              ))}
            </ul>
          </section>
        );
      })}
      {!data.crm && <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{t("noCrm")}</p>}
    </div>
  );
}

function StepCard({ step, slug, isNext, onSkip }: { step: StartStep; slug: string; isNext: boolean; onSkip: (skipped: boolean) => void }) {
  const t = useTranslations("start");
  const done = step.status === "done";
  const skipped = step.status === "skipped";
  return (
    <li className={cn("flex flex-col gap-2 rounded-xl border bg-card p-3.5", isNext ? "border-primary ring-1 ring-primary" : "border-border", (done || skipped) && "opacity-80")} data-testid="start-step" data-step={step.id} data-status={step.status}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", done ? "bg-[var(--health-green)] text-white" : "text-muted-foreground")} aria-hidden>
          {done ? <Check className="size-4" /> : skipped ? <MinusCircle className="size-5" /> : <Circle className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn("font-medium", done && "line-through decoration-muted-foreground/50")}>{t(`step.${step.id as "profile"}.title`)}</h3>
            {step.optional && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t("optionalBadge")}</span>}
            {skipped && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t("skippedBadge")}</span>}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{t(`step.${step.id as "profile"}.text`)}</p>
          {step.progress && (
            <div className="mt-2 flex items-center gap-2" data-testid="step-progress">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((step.progress.value / step.progress.goal) * 100)}%` }} />
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {step.progress.value} / {step.progress.goal}
              </span>
            </div>
          )}
        </div>
      </div>
      {!done && (
        <div className="flex flex-wrap items-center gap-2 pl-9">
          {!skipped && (
            <Button asChild size="sm" variant={isNext ? "primary" : "outline"}>
              <Link href={stepHref(slug, step.path)}>
                {t("open")}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          )}
          <Link href={`/w/${slug}/knowledge?a=${step.article}`} className="text-xs text-primary hover:underline" data-testid="step-howto">
            {t("howTo")}
          </Link>
          <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onSkip(!skipped)} data-testid="step-skip">
            {skipped ? t("unskip") : t("skip")}
          </button>
        </div>
      )}
    </li>
  );
}

function DreamCard({ workspaceId, data, onSaved }: { workspaceId: string; data: OnboardingData; onSaved: () => void }) {
  const t = useTranslations("start");
  const [form, setForm] = useState<{ dream: string; why: string; targetDate: string; clients: string; partners: string }>({ dream: "", why: "", targetDate: "", clients: "", partners: "" });
  const [saved, setSaved] = useState(false);
  const g: GoalDto = data.goal;
  useEffect(() => setForm({ dream: g.dream, why: g.why, targetDate: g.targetDate ?? "", clients: g.targetClients === null ? "" : String(g.targetClients), partners: g.targetPartners === null ? "" : String(g.targetPartners) }), [g.dream, g.why, g.targetDate, g.targetClients, g.targetPartners]);

  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/workspaces/${workspaceId}/onboarding/goal`, { dream: form.dream.trim(), why: form.why.trim(), targetDate: form.targetDate || null, targetClients: num(form.clients), targetPartners: num(form.partners) }),
    onSuccess: () => {
      setSaved(true);
      onSaved();
    },
  });
  const set = (patch: Partial<typeof form>) => (setForm((f) => ({ ...f, ...patch })), setSaved(false));
  const d = data.distance;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5" data-testid="dream-card">
      <div>
        <h2 className="text-lg font-semibold">{t("dreamTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("dreamHint")}</p>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <FormField label={t("dream")}>
          <Input value={form.dream} maxLength={500} placeholder={t("dreamPlaceholder")} onChange={(e) => set({ dream: e.target.value })} data-testid="dream-text" />
        </FormField>
        <FormField label={t("why")}>
          <textarea className={`${textareaClass} min-h-20`} value={form.why} maxLength={2000} placeholder={t("whyPlaceholder")} onChange={(e) => set({ why: e.target.value })} data-testid="dream-why" />
        </FormField>
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label={t("targetDate")}>
            <Input type="date" value={form.targetDate} onChange={(e) => set({ targetDate: e.target.value })} data-testid="dream-date" />
          </FormField>
          {data.crm && (
            <>
              <FormField label={t("targetClients")}>
                <Input type="number" min={0} max={100000} value={form.clients} onChange={(e) => set({ clients: e.target.value })} data-testid="dream-clients" />
              </FormField>
              <FormField label={t("targetPartners")}>
                <Input type="number" min={0} max={100000} value={form.partners} onChange={(e) => set({ partners: e.target.value })} data-testid="dream-partners" />
              </FormField>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={save.isPending} data-testid="dream-save">
            {t("saveDream")}
          </Button>
          {saved && <span className="text-sm text-muted-foreground">{t("saved")}</span>}
        </div>
      </form>

      {data.crm && (
        <div className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3" data-testid="distance">
          <h3 className="text-sm font-semibold">{t("distanceTitle")}</h3>
          {d.percent === null ? (
            <p className="text-sm text-muted-foreground">{t("noTargets")}</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-background" aria-hidden>
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${d.percent}%` }} />
                </span>
                <span className="text-sm font-medium tabular-nums" data-testid="distance-percent">
                  {t("distancePercent", { n: d.percent })}
                </span>
              </div>
              <ul className="flex flex-col gap-0.5 text-sm">
                {d.clients && <li data-testid="distance-clients">{t("clientsLeft", { left: d.clients.left, have: d.clients.have, target: d.clients.target })}</li>}
                {d.partners && <li data-testid="distance-partners">{t("partnersLeft", { left: d.partners.left, have: d.partners.have, target: d.partners.target })}</li>}
                {d.daysLeft !== null && <li className={cn(d.daysLeft < 0 && "text-[var(--health-red)]")}>{d.daysLeft >= 0 ? t("daysLeft", { n: d.daysLeft }) : t("daysOver", { n: -d.daysLeft })}</li>}
              </ul>
              {d.perWeek && (d.perWeek.clients > 0 || d.perWeek.partners > 0) && <p className="text-xs text-muted-foreground">{t("pace", { clients: d.perWeek.clients, partners: d.perWeek.partners })}</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
