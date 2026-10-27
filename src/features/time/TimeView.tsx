"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Play, Square, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/features/mindmap/api";
import { PERIODS, shiftPeriod, type Period } from "@/modules/time/period";
import { formatClock, formatMinutes } from "@/modules/time/time";
import { cn } from "@/lib/utils";
import { Timesheet } from "./Timesheet";
import { StartTimerDialog, useRunningTimer } from "./useTimer";

interface Summary {
  period: Period;
  anchor: string;
  from: string | null;
  to: string | null;
  today: string;
  overview: { today: number; week: number; month: number; all: number };
  totalMinutes: number;
  billableMinutes: number;
  truncated: boolean;
  series: { key: string; minutes: number }[];
  items: { nodeId: string | null; title: string; projectTitle: string | null; minutes: number }[];
  entries: { id: string; nodeId: string | null; title: string; label: string | null; projectTitle: string | null; date: string; minutes: number; billable: boolean; note: string | null }[];
}

/**
 * My time: the timer (start it, stop it), what I spent today, this week, this month and in all, and the same by day, week, month or all time
 * with the days laid out, where the time went and the entries themselves.
 */
export function TimeView({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const t = useTranslations("time");
  const locale = useLocale();
  const qc = useQueryClient();
  const { timer, seconds, stop } = useRunningTimer();
  const [starting, setStarting] = useState(false);
  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState<string | null>(null);

  const key = ["time-summary", workspaceId, period, anchor];
  const { data, isLoading } = useQuery({ queryKey: key, placeholderData: (p) => p, queryFn: () => api.get<Summary>(`/api/v1/workspaces/${workspaceId}/time-summary?period=${period}${anchor ? `&date=${anchor}` : ""}`) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["time-summary", workspaceId] });

  // Starting or stopping the timer anywhere changes the numbers here.
  useEffect(() => {
    window.addEventListener("meetowl:timer-stopped", refresh);
    window.addEventListener("meetowl:timer", refresh);
    return () => {
      window.removeEventListener("meetowl:timer-stopped", refresh);
      window.removeEventListener("meetowl:timer", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh only uses the stable query client
  }, []);

  const remove = useMutation({ mutationFn: (id: string) => api.del(`/api/v1/time/${id}`), onSuccess: refresh });

  const day = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString(locale, { ...opts, timeZone: "UTC" });
  const base = anchor ?? data?.today ?? new Date().toISOString().slice(0, 10);
  const rangeLabel = !data
    ? ""
    : period === "all"
      ? t("periodAllLabel")
      : period === "day"
        ? day(data.anchor, { weekday: "long", day: "numeric", month: "long" })
        : period === "week"
          ? `${day(data.from as string, { day: "numeric", month: "short" })} – ${day(data.to as string, { day: "numeric", month: "short" })}`
          : day(data.anchor, { month: "long", year: "numeric" });
  const isNow = !!data && data.from !== null && data.to !== null && data.today >= data.from && data.today <= data.to;
  const max = Math.max(1, ...(data?.series.map((s) => s.minutes) ?? [1]));
  const seriesLabel = (k: string) => (period === "all" ? day(`${k}-01`, { month: "short", year: "2-digit" }) : period === "week" ? day(k, { weekday: "short", day: "numeric" }) : k.slice(8));

  const card = (label: string, minutes: number, p: Period) => (
    <button type="button" onClick={() => (setPeriod(p), setAnchor(null))} aria-pressed={period === p && !anchor} data-testid={`overview-${p}`} className={cn("flex flex-col gap-1 rounded-xl border bg-card p-3 text-left hover:border-primary", period === p && !anchor ? "border-primary ring-1 ring-primary" : "border-border")}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{formatMinutes(minutes)}</span>
    </button>
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6" data-testid="time-view">
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4" data-testid="timer-panel">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {timer ? (
            <>
              <span className="min-w-0 max-w-64 truncate text-sm text-muted-foreground" title={timer.title}>
                {timer.title || t("noTask")}
              </span>
              <span className="text-3xl font-semibold tabular-nums" data-testid="panel-clock">
                {formatClock(seconds)}
              </span>
              <Button variant="danger" onClick={() => void stop()} data-testid="panel-stop">
                <Square className="size-4 fill-current" />
                {t("stop")}
              </Button>
            </>
          ) : (
            <Button onClick={() => setStarting(true)} data-testid="panel-start">
              <Play className="size-4" />
              {t("start")}
            </Button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {card(t("today"), data?.overview.today ?? 0, "day")}
        {card(t("thisWeekLabel"), data?.overview.week ?? 0, "week")}
        {card(t("thisMonth"), data?.overview.month ?? 0, "month")}
        {card(t("allTime"), data?.overview.all ?? 0, "all")}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5" role="radiogroup" aria-label={t("periodLabel")}>
          {PERIODS.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={period === p} onClick={() => (setPeriod(p), setAnchor(null))} data-testid={`period-${p}`} className={cn("h-8 rounded-full border px-3 text-sm", period === p ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground hover:bg-muted")}>
              {t(`period.${p}`)}
            </button>
          ))}
        </div>
        {period !== "all" && (
          <div className="ml-auto flex items-center gap-1">
            <button type="button" aria-label={t("prev")} className="rounded-md p-1.5 hover:bg-muted" onClick={() => setAnchor(shiftPeriod(period, base, -1))}>
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-40 text-center text-sm font-medium" data-testid="range-label">
              {rangeLabel}
            </span>
            <button type="button" aria-label={t("next")} className="rounded-md p-1.5 hover:bg-muted" onClick={() => setAnchor(shiftPeriod(period, base, 1))}>
              <ChevronRight className="size-4" />
            </button>
            {!isNow && (
              <Button variant="ghost" size="sm" onClick={() => setAnchor(null)}>
                {t("backToNow")}
              </Button>
            )}
          </div>
        )}
      </div>

      {isLoading || !data ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <>
          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4" data-testid="time-period">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="text-3xl font-semibold tabular-nums" data-testid="period-total">
                {formatMinutes(data.totalMinutes)}
              </span>
              {data.totalMinutes > 0 && <span className="text-sm text-muted-foreground">{t("billableOf", { value: formatMinutes(data.billableMinutes) })}</span>}
            </div>
            {data.truncated && <p className="text-xs text-[var(--health-yellow)]">{t("truncated")}</p>}
            {period !== "day" && data.series.length > 0 && (
              <div className="flex h-36 items-end gap-1 overflow-x-auto pb-1" data-testid="time-bars" role="img" aria-label={t("barsLabel")}>
                {(period === "all" ? [...data.series].reverse() : data.series).map((s) => (
                  <div key={s.key} className="flex min-w-6 flex-1 flex-col items-center justify-end gap-1" title={`${seriesLabel(s.key)}: ${formatMinutes(s.minutes)}`}>
                    <span className="text-[10px] tabular-nums text-muted-foreground">{s.minutes ? formatMinutes(s.minutes) : ""}</span>
                    <span className={cn("w-full rounded-t", s.key === data.today ? "bg-primary" : "bg-primary/50")} style={{ height: `${Math.max(s.minutes ? 3 : 1, (s.minutes / max) * 100)}%`, minHeight: s.minutes ? 3 : 1 }} data-minutes={s.minutes} />
                    <span className="text-[10px] text-muted-foreground">{seriesLabel(s.key)}</span>
                  </div>
                ))}
              </div>
            )}
            {data.totalMinutes === 0 && <p className="text-sm text-muted-foreground">{t("emptyPeriod")}</p>}
          </section>

          {data.items.length > 0 && (
            <section className="flex flex-col gap-2" data-testid="time-items">
              <h2 className="text-lg font-semibold">{t("whereItWent")}</h2>
              <ul className="flex flex-col gap-1.5">
                {data.items.map((i) => (
                  <li key={i.nodeId ?? `l:${i.title}`} className="flex flex-col gap-1 rounded-xl border border-border bg-card px-3 py-2 text-sm">
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium">{i.title || t("noTask")}</span>
                      {i.projectTitle && <span className="truncate text-xs text-muted-foreground">{i.projectTitle}</span>}
                      {!i.nodeId && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t("noTaskBadge")}</span>}
                      <span className="font-medium tabular-nums">{formatMinutes(i.minutes)}</span>
                    </div>
                    <span className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((i.minutes / Math.max(1, data.totalMinutes)) * 100)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.entries.length > 0 && (
            <section className="flex flex-col gap-2" data-testid="time-entries">
              <h2 className="text-lg font-semibold">{t("entriesTitle")}</h2>
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card text-sm">
                {data.entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-3 py-2" data-testid="time-entry">
                    <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">{day(e.date, { day: "numeric", month: "short" })}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{e.title || t("noTask")}</span>
                      {e.note && <span className="text-muted-foreground"> · {e.note}</span>}
                    </span>
                    <span className="w-16 shrink-0 text-right font-medium tabular-nums">{formatMinutes(e.minutes)}</span>
                    <button type="button" aria-label={t("delete")} title={t("delete")} className="text-muted-foreground hover:text-danger" onClick={() => window.confirm(t("deleteConfirm")) && remove.mutate(e.id)}>
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {period === "week" && (
            <details className="rounded-2xl border border-border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{t("sheetByTask")}</summary>
              <Timesheet workspaceId={workspaceId} slug={slug} />
            </details>
          )}
        </>
      )}

      <StartTimerDialog open={starting} onClose={() => setStarting(false)} workspaceId={workspaceId} />
    </div>
  );
}
