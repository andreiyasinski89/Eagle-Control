"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiFailure } from "@/features/mindmap/api";
import { GroupedBars, HBars, SERIES } from "./Charts";
import { Card, Stat } from "./ui";

interface Report {
  pipeline: { id: string; name: string };
  funnel: { rows: { stageId: string; name: string; reached: number; conversion: number | null }[]; lost: number; deals: number };
  forecast: Record<string, { month: string; count: number; total: number; weighted: number }[]>;
  winLoss: { won: number; lost: number; winRate: number | null; wonAmount: Record<string, number>; lostAmount: Record<string, number>; reasons: { reason: string; count: number }[]; avgCycleDays: number | null; medianCycleDays: number | null };
  sources: { source: string; deals: number; won: number; conversion: number; wonAmount: Record<string, number> }[];
  managers: { ownerId: string; name: string; calls: number; emails: number; meetings: number; notes: number; tasksDone: number; dealsWon: number; wonAmount: Record<string, number> }[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

export function CrmReports({ workspaceId, canExport }: { workspaceId: string; canExport: boolean }) {
  const t = useTranslations("reports");
  const locale = useLocale();
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getTime() - 90 * 86_400_000)));
  const [to, setTo] = useState(iso(now));
  const qs = `from=${from}&to=${to}`;
  const { data, error, isLoading } = useQuery({ queryKey: ["crm-report", workspaceId, from, to], enabled: from <= to, queryFn: () => api.get<Report>(`/api/v1/workspaces/${workspaceId}/reports/crm?${qs}`) });
  const money = (m: Record<string, number>) => Object.entries(m).map(([c, v]) => new Intl.NumberFormat(locale, { style: "currency", currency: c, maximumFractionDigits: 0 }).format(v)).join(" · ") || "—";
  const csv = (section: string) =>
    canExport && (
      <Button variant="ghost" size="sm" aria-label={t("csvOf", { section })} onClick={() => window.open(`/api/v1/workspaces/${workspaceId}/reports/crm?${qs}&format=csv&section=${section}`, "_blank", "noopener")}>
        <Download className="size-4" />
        CSV
      </Button>
    );

  return (
    <div className="flex flex-col gap-4" data-testid="crm-reports">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("from")}
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("to")}
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        {data && <span className="pb-2 text-xs text-muted-foreground">{t("pipeline", { name: data.pipeline.name })}</span>}
      </div>
      {error instanceof ApiFailure && (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">…</p>}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label={t("winRate")} value={pct(data.winLoss.winRate)} hint={t("wonLost", { won: data.winLoss.won, lost: data.winLoss.lost })} />
            <Stat label={t("wonAmount")} value={money(data.winLoss.wonAmount)} />
            <Stat label={t("avgCycle")} value={data.winLoss.avgCycleDays === null ? "—" : t("days", { n: data.winLoss.avgCycleDays })} hint={t("medianCycle", { n: data.winLoss.medianCycleDays ?? "—" })} />
            <Stat label={t("lostAmount")} value={money(data.winLoss.lostAmount)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={t("funnel")} hint={t("funnelHint")} action={csv("funnel")}>
              <HBars rows={data.funnel.rows.map((r) => ({ label: r.name, value: r.reached, note: r.conversion === null ? undefined : `(${pct(r.conversion)})` }))} />
              <p className="mt-2 text-xs text-muted-foreground">{t("lostInPeriod", { n: data.funnel.lost })}</p>
            </Card>
            <Card title={t("forecast")} hint={t("forecastHint")} action={csv("forecast")}>
              {Object.keys(data.forecast).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noData")}</p>
              ) : (
                Object.entries(data.forecast).map(([cur, rows]) => (
                  <div key={cur} className="mb-3">
                    <h4 className="mb-1 text-xs font-medium text-muted-foreground">{cur}</h4>
                    <GroupedBars label={`${t("forecast")} ${cur}`} labels={rows.map((r) => (r.month === "none" ? t("noDate") : r.month))} series={[{ name: t("total"), color: SERIES[1], values: rows.map((r) => r.total) }, { name: t("weighted"), color: SERIES[0], values: rows.map((r) => r.weighted) }]} />
                  </div>
                ))
              )}
            </Card>
            <Card title={t("winLoss")} hint={t("reasons")} action={csv("winloss")}>
              {data.winLoss.reasons.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("noData")}</p> : <HBars color={SERIES[5]} rows={data.winLoss.reasons.map((r) => ({ label: r.reason, value: r.count }))} />}
            </Card>
            <Card title={t("sources")} action={csv("sources")}>
              <Table head={[t("source"), t("deals"), t("won"), t("conversion"), t("wonAmount")]} rows={data.sources.map((s) => [s.source, String(s.deals), String(s.won), pct(s.conversion), money(s.wonAmount)])} empty={t("noData")} />
            </Card>
            <div className="lg:col-span-2">
              <Card title={t("managers")} hint={t("managersHint")} action={csv("managers")}>
                <Table head={[t("manager"), t("calls"), t("emails"), t("meetings"), t("notes"), t("tasksDone"), t("dealsWon"), t("wonAmount")]} rows={data.managers.map((m) => [m.name, String(m.calls), String(m.emails), String(m.meetings), String(m.notes), String(m.tasksDone), String(m.dealsWon), money(m.wonAmount)])} empty={t("noData")} />
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            {head.map((h, i) => (
              <th key={h + i} className={`px-2 py-1.5 font-medium ${i === 0 ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => (
                <td key={j} className={`px-2 py-1.5 ${j === 0 ? "text-left" : "text-right tabular-nums"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
