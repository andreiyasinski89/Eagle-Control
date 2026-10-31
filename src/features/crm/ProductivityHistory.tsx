"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/features/mindmap/api";
import { HISTORY_PERIODS, type Average, type DayRow, type HistoryPeriod, type Point } from "@/modules/crm/day-history";
import { cn } from "@/lib/utils";

interface History {
  period: HistoryPeriod;
  today: string;
  range: { from: string; to: string; bucket: "day" | "week" };
  points: Point[];
  days: DayRow[];
  average: Average;
  previous: Average | null;
  trend: { efficiency: "up" | "down" | "same" | null; productivity: "up" | "down" | "same" | null };
  yesterday: DayRow | null;
  todayRow: DayRow | null;
  savedDays: number;
  since: string | null;
}

const Arrow = ({ dir }: { dir: "up" | "down" | "same" | null }) =>
  dir === "up" ? <ArrowUp className="size-4 text-[var(--health-green)]" aria-label="up" /> : dir === "down" ? <ArrowDown className="size-4 text-[var(--health-red)]" aria-label="down" /> : dir === "same" ? <ArrowRight className="size-4 text-muted-foreground" aria-label="same" /> : null;

/**
 * The history of the day plan: yesterday against today, or the way the two percentages went over a week, 30 days, a year or all the time,
 * with the average, whether it got better or worse than the span before, and the numbers of any day pressed on the chart.
 */
export function ProductivityHistory({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("history");
  const locale = useLocale();
  const [period, setPeriod] = useState<HistoryPeriod>("week");
  const [picked, setPicked] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({ queryKey: ["day-history", workspaceId, period], staleTime: 60_000, queryFn: () => api.get<History>(`/api/v1/workspaces/${workspaceId}/day-history?period=${period}`) });
  const fmt = (d: string, long = false) => new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : locale, { day: "numeric", month: long ? "long" : "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

  const chart = (data?.points ?? []).map((p) => ({ key: p.from, label: p.from === p.to ? fmt(p.from) : `${fmt(p.from)} – ${fmt(p.to)}`, efficiency: p.efficiency, productivity: p.productivity, days: p.days }));
  const day = picked ? data?.days.find((d) => d.day === picked) : undefined;

  return (
    <section className="flex flex-col gap-3" data-testid="productivity-history" aria-labelledby="history-title">
      <h2 id="history-title" className="text-sm font-semibold">
        {t("title")}
      </h2>
      <div role="radiogroup" aria-label={t("period")} className="flex flex-wrap gap-1.5">
        {HISTORY_PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={period === p}
            onClick={() => (setPicked(null), setPeriod(p))}
            className={cn("min-h-11 rounded-full border px-4 text-sm", period === p ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground hover:bg-muted")}
            data-testid={`history-${p}`}
          >
            {t(`periods.${p}`)}
          </button>
        ))}
      </div>

      {isLoading && <Skeleton className="h-56 rounded-2xl" />}
      {isError && (
        <p role="alert" className="text-sm text-danger">
          {t("error")}
        </p>
      )}
      {data && data.savedDays === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground" data-testid="history-empty">
          {t("empty")}
        </p>
      )}

      {data && data.savedDays > 0 && period === "yesterday" && (
        <div className="grid gap-3 sm:grid-cols-2" data-testid="history-yesterday">
          {([["yesterday", data.yesterday], ["today", data.todayRow]] as const).map(([k, r]) => (
            <div key={k} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid={`day-${k}`}>
              <h3 className="text-sm font-semibold">{t(k)}</h3>
              {r ? (
                <>
                  <div className="flex gap-6">
                    <Stat label={t("efficiency")} value={pct(r.efficiency)} />
                    <Stat label={t("productivity")} value={pct(r.productivity)} />
                  </div>
                  <p className="text-xs text-muted-foreground">{t("planFact", { planned: r.planned, done: r.done })}</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noDay")}</p>
              )}
            </div>
          ))}
          {data.yesterday && data.todayRow && (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:col-span-2" data-testid="history-compare">
              <span className="inline-flex items-center gap-1">
                {t("efficiency")}: <Arrow dir={delta(data.todayRow.efficiency, data.yesterday.efficiency)} />
              </span>
              <span className="inline-flex items-center gap-1">
                {t("productivity")}: <Arrow dir={delta(data.todayRow.productivity, data.yesterday.productivity)} />
              </span>
              <span className="text-xs text-muted-foreground">{t("todayVsYesterday")}</span>
            </p>
          )}
        </div>
      )}

      {data && data.savedDays > 0 && period !== "yesterday" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap gap-x-8 gap-y-3" data-testid="history-average">
            <Stat label={t("avgEfficiency")} value={pct(data.average.efficiency)} sub={data.previous ? t("before", { v: pct(data.previous.efficiency) }) : undefined} trend={data.trend.efficiency} />
            <Stat label={t("avgProductivity")} value={pct(data.average.productivity)} sub={data.previous ? t("before", { v: pct(data.previous.productivity) }) : undefined} trend={data.trend.productivity} />
            <Stat label={t("daysCounted")} value={String(data.average.days)} />
          </div>
          <div className="h-56 w-full" role="img" aria-label={t("chartLabel")} data-testid="history-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} onClick={(e) => data.range.bucket === "day" && typeof e?.activeLabel === "string" && setPicked(data.points.find((p) => fmt(p.from) === e.activeLabel)?.from ?? null)}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v) => (typeof v === "number" ? `${v}%` : "—")} />
                <Legend />
                <Line type="monotone" dataKey="efficiency" name={t("efficiency")} stroke="var(--primary)" strokeWidth={2} dot={chart.length <= 40} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="productivity" name={t("productivity")} stroke="var(--health-green)" strokeWidth={2} dot={chart.length <= 40} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {data.range.bucket === "week" && <p className="text-xs text-muted-foreground">{t("byWeeks")}</p>}
          {data.range.bucket === "day" && !day && <p className="text-xs text-muted-foreground">{t("pressDay")}</p>}
          {day && (
            <div className="rounded-lg border border-border p-3 text-sm" data-testid="history-day">
              <p className="font-medium">{fmt(day.day, true)}</p>
              <p className="text-xs text-muted-foreground">
                {t("efficiency")} {pct(day.efficiency)} · {t("productivity")} {pct(day.productivity)} · {t("planFact", { planned: day.planned, done: day.done })}
              </p>
              <p className="text-xs text-muted-foreground">{t("breakdown", { tasks: `${day.tasks.done}/${day.tasks.planned}`, meetings: `${day.meetings.done}/${day.meetings.planned}`, follow: `${day.followUps.done}/${day.followUps.planned}` })}</p>
            </div>
          )}
        </div>
      )}
      {data?.since && <p className="text-xs text-muted-foreground">{t("since", { date: fmt(data.since, true) })}</p>}
    </section>
  );
}

const delta = (now: number | null, before: number | null): "up" | "down" | "same" | null => (now === null || before === null ? null : Math.abs(now - before) <= 1 ? "same" : now > before ? "up" : "down");

function Stat({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: "up" | "down" | "same" | null }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1 text-2xl font-semibold tabular-nums">
        {value}
        {trend !== undefined && <Arrow dir={trend} />}
      </span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}
