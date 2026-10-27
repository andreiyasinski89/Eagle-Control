"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, ClipboardCopy } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/features/mindmap/api";
import { METRICS, progress, type Counts, type Goals, type Metric } from "@/modules/crm/tracker";
import type { Stage, Temp } from "@/modules/crm/people";
import { cn } from "@/lib/utils";
import { ContactDrawer } from "./ContactDrawer";
import { copyToClipboard, useScriptFiller, useScripts } from "./useScripts";

interface Week {
  week: number;
  from: string;
  to: string;
  counts: Counts;
  goals: Goals;
  team: ({ id: string; name: string } & Counts)[];
}
interface Due {
  id: string;
  name: string;
  stage: Stage;
  temperature: Temp | null;
  nextStep: string | null;
  nextStepAt: string | null;
  telegram: string | null;
  phone: string | null;
}
interface DueData {
  items: Due[];
  today: string;
}

const WARM_ICON: Record<string, string> = { HOT: "🔥", WARM: "🟡", COLD: "❄️" };
const TEAM_METRICS: Metric[] = ["contacted", "presentations", "clients", "partners"];

/**
 * The day of a person who works with people: the week so far against the week's targets, then everyone whose next step is due today or late,
 * each with the script for their stage to copy and buttons to close the step (and set the next one) in a press.
 */
export function DayPlan({ workspaceId, slug, canWrite, canExport, canErase, meId }: { workspaceId: string; slug: string; canWrite: boolean; canExport: boolean; canErase: boolean; meId: string }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const openId = search.get("contact");
  const [week, setWeek] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [editGoals, setEditGoals] = useState(false);
  const scripts = useScripts(workspaceId);
  const fill = useScriptFiller(workspaceId, meId);

  const wk = useQuery({ queryKey: ["tracker", workspaceId, week], placeholderData: (p) => p, queryFn: () => api.get<Week>(`/api/v1/workspaces/${workspaceId}/tracker?week=${week}`) });
  const due = useQuery({ queryKey: ["people", workspaceId, "day", meId], queryFn: () => api.get<DueData>(`/api/v1/workspaces/${workspaceId}/people?ownerId=${meId}&due=1`) });

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (id) next.set("contact", id);
    else next.delete("contact");
    router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
  };
  const refresh = () => {
    for (const k of ["people", "tracker", "contact", "activities"]) void qc.invalidateQueries({ queryKey: [k] });
  };

  const done = useMutation({ mutationFn: ({ id, afterDays }: { id: string; afterDays?: number }) => api.post(`/api/v1/contacts/${id}/step-done`, afterDays === undefined ? {} : { afterDays }), onSuccess: refresh });
  const saveGoals = useMutation({ mutationFn: (goals: Goals) => api.put(`/api/v1/workspaces/${workspaceId}/tracker/goals`, { goals }), onSuccess: () => void qc.invalidateQueries({ queryKey: ["tracker", workspaceId] }) });

  const dayLabel = (iso: string) => {
    const day = iso.slice(0, 10);
    const today = due.data?.today ?? "";
    return { text: new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" }), late: !!today && day < today };
  };
  const range = wk.data ? `${new Date(`${wk.data.from}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" })} – ${new Date(`${wk.data.to}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" })}` : "";

  const copyScript = async (p: Due, body: string, id: string) => {
    if (await copyToClipboard(fill(body, p.name))) {
      setCopied(`${p.id}:${id}`);
      setTimeout(() => setCopied((c) => (c === `${p.id}:${id}` ? null : c)), 2000);
    }
  };
  const scriptsFor = (stage: Stage) => (scripts.data ?? []).filter((s) => s.stage === stage || s.stage === null);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4" data-testid="day-plan">
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4" data-testid="week-tracker">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">{t("dayTitle")}</h1>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" aria-label={t("weekPrev")} className="rounded-md p-1.5 hover:bg-muted" onClick={() => setWeek((w) => Math.max(-52, w - 1))}>
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-36 text-center text-sm tabular-nums" data-testid="week-range">
              {week === 0 ? t("weekThis") : range}
              {week === 0 && <span className="ml-1 text-muted-foreground">· {range}</span>}
            </span>
            <button type="button" aria-label={t("weekNext")} disabled={week >= 0} className="rounded-md p-1.5 hover:bg-muted disabled:opacity-40" onClick={() => setWeek((w) => Math.min(0, w + 1))}>
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {METRICS.map((m) => {
            const count = wk.data?.counts[m] ?? 0;
            const goal = wk.data?.goals[m];
            const pct = progress(count, goal);
            return (
              <li key={m} className="flex flex-col gap-1.5 rounded-xl bg-muted/50 p-3" data-testid={`metric-${m}`}>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-muted-foreground">{t(`metric.${m}`)}</span>
                  <span className="ml-auto text-2xl font-semibold tabular-nums">{count}</span>
                  {goal !== undefined && goal > 0 && <span className="text-sm tabular-nums text-muted-foreground">/ {goal}</span>}
                </div>
                {pct !== null && (
                  <span className="h-1.5 overflow-hidden rounded-full bg-background" aria-hidden>
                    <span className={cn("block h-full rounded-full", pct >= 100 ? "bg-[var(--health-green)]" : "bg-primary")} style={{ width: `${pct}%` }} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button type="button" className="text-primary hover:underline" onClick={() => setEditGoals((v) => !v)} data-testid="edit-goals">
            {editGoals ? t("goalsClose") : t("goalsEdit")}
          </button>
        </div>
        {editGoals && (
          <div className="grid gap-2 sm:grid-cols-3" data-testid="goals-form">
            {METRICS.map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-muted-foreground">{t(`metric.${m}`)}</span>
                <input
                  type="number"
                  min={0}
                  max={9999}
                  aria-label={t("goalFor", { metric: t(`metric.${m}`) })}
                  defaultValue={wk.data?.goals[m] ?? ""}
                  key={`${m}-${wk.data?.goals[m] ?? ""}`}
                  className="h-8 w-20 rounded-md border border-border bg-card px-2 text-right text-sm"
                  onBlur={(e) => {
                    const v = e.target.value === "" ? 0 : Number(e.target.value);
                    if (v !== (wk.data?.goals[m] ?? 0)) saveGoals.mutate({ ...(wk.data?.goals ?? {}), [m]: v });
                  }}
                />
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2" data-testid="day-list">
        <h2 className="text-lg font-semibold">
          {t("dueTitle")}
          {due.data && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-sm tabular-nums">{due.data.items.length}</span>}
        </h2>
        {due.data && due.data.items.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">{t("dueEmpty")}</p>}
        <ul className="flex flex-col gap-2">
          {due.data?.items.map((p) => {
            const d = p.nextStepAt ? dayLabel(p.nextStepAt) : null;
            const sc = scriptsFor(p.stage);
            return (
              <li key={p.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-sm" data-testid="due-row" data-person={p.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="font-medium hover:underline" onClick={() => setOpen(p.id)}>
                    {p.name}
                  </button>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(`funnelStage.${p.stage}`)}</span>
                  {p.temperature && <span aria-label={t(`temp.${p.temperature}`)}>{WARM_ICON[p.temperature]}</span>}
                  {d && <span className={cn("ml-auto text-xs tabular-nums", d.late ? "text-[var(--health-red)]" : "text-muted-foreground")}>{d.text}</span>}
                </div>
                <div className="text-muted-foreground">{p.nextStep ?? t("nextStepNone")}</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {canWrite && (
                    <>
                      <button type="button" disabled={done.isPending} onClick={() => done.mutate({ id: p.id })} data-testid="step-done" className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground">
                        <Check className="size-3.5" />
                        {t("stepDone")}
                      </button>
                      {[1, 3, 7].map((n) => (
                        <button key={n} type="button" disabled={done.isPending} onClick={() => done.mutate({ id: p.id, afterDays: n })} data-testid={`step-next-${n}`} title={t("stepDoneNext", { n })} className="h-7 rounded-md border border-border px-2 text-xs hover:bg-muted">
                          {t("stepNextShort", { n })}
                        </button>
                      ))}
                    </>
                  )}
                  <span className="ml-auto flex flex-wrap gap-1.5">
                    {sc.map((s) => (
                      <button key={s.id} type="button" onClick={() => void copyScript(p, s.body, s.id)} data-testid="copy-script" className="inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-muted" title={s.title}>
                        <ClipboardCopy className="size-3.5" />
                        {copied === `${p.id}:${s.id}` ? t("handoff.copied") : s.title}
                      </button>
                    ))}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {wk.data && wk.data.team.length > 0 && (
        <section className="flex flex-col gap-2" data-testid="team-week">
          <h2 className="text-lg font-semibold">{t("teamWeekTitle")}</h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">{t("teamTitle")}</th>
                  {TEAM_METRICS.map((m) => (
                    <th key={m} className="px-3 py-2 text-right">
                      {t(`metric.${m}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {wk.data.team.map((r) => (
                  <tr key={r.id} className="border-t border-border" data-testid="team-week-row">
                    <td className="px-3 py-2">
                      <button type="button" className="hover:underline" onClick={() => setOpen(r.id)}>
                        {r.name}
                      </button>
                    </td>
                    {TEAM_METRICS.map((m) => (
                      <td key={m} className="px-3 py-2 text-right tabular-nums">
                        {r[m]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">{t("teamWeekHint")}</p>
        </section>
      )}

      {openId && <ContactDrawer key={openId} workspaceId={workspaceId} slug={slug} contactId={openId} canWrite={canWrite} canErase={canErase} canExport={canExport} meId={meId} onClose={() => setOpen(null)} />}
    </div>
  );
}
