"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { api } from "@/features/mindmap/api";
import { formatMinutes } from "@/modules/time/time";

interface Sheet {
  weekStart: string;
  days: string[];
  tasks: { nodeId: string; title: string; projectId: string | null; projectTitle: string | null; perDay: Record<string, number>; total: number }[];
  perDay: Record<string, number>;
  totalMinutes: number;
  billableMinutes: number;
}

const shift = (day: string, days: number) => new Date(new Date(`${day}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

/** My hours for one week: tasks down, days across. */
export function Timesheet({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const t = useTranslations("time");
  const locale = useLocale();
  const [week, setWeek] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["timesheet", workspaceId, week],
    queryFn: () => api.get<Sheet>(`/api/v1/workspaces/${workspaceId}/timesheet${week ? `?week=${week}` : ""}`),
  });
  const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(locale, { weekday: "short", day: "numeric", timeZone: "UTC" });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{t("timesheet")}</h1>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" aria-label={t("prevWeek")} disabled={!data} onClick={() => data && setWeek(shift(data.weekStart, -7))}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-36 text-center text-sm tabular-nums">{data ? `${dayLabel(data.days[0]!)} – ${dayLabel(data.days[6]!)}` : "…"}</span>
          <Button variant="outline" size="sm" aria-label={t("nextWeek")} disabled={!data} onClick={() => data && setWeek(shift(data.weekStart, 7))}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setWeek(null)}>
            {t("thisWeek")}
          </Button>
        </div>
      </div>

      {isLoading || !data ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : data.tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t("emptyWeek")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm" data-testid="timesheet">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">{t("task")}</th>
                {data.days.map((d) => (
                  <th key={d} className="px-2 py-2 text-right font-medium">
                    {dayLabel(d)}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">{t("sum")}</th>
              </tr>
            </thead>
            <tbody>
              {data.tasks.map((r) => (
                <tr key={r.nodeId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <Link href={r.projectId ? `/w/${slug}/projects/p/${r.projectId}?node=${r.nodeId}` : `/w/${slug}/projects`} className="hover:underline">
                      {r.title}
                    </Link>
                    {r.projectTitle && <div className="text-xs text-muted-foreground">{r.projectTitle}</div>}
                  </td>
                  {data.days.map((d) => (
                    <td key={d} className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                      {r.perDay[d] ? formatMinutes(r.perDay[d]) : ""}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMinutes(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/50 font-medium">
                <td className="px-3 py-2">
                  {t("total", { value: formatMinutes(data.totalMinutes) })} · {t("billableOf", { value: formatMinutes(data.billableMinutes) })}
                </td>
                {data.days.map((d) => (
                  <td key={d} className="px-2 py-2 text-right tabular-nums">
                    {data.perDay[d] ? formatMinutes(data.perDay[d]) : ""}
                  </td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums">{formatMinutes(data.totalMinutes)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
