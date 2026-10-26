"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiFailure } from "@/features/mindmap/api";
import { formatMinutes } from "@/modules/time/time";

interface Report {
  showMoney: boolean;
  currency: string;
  totals: { minutes: number; billableMinutes: number; amount: number | null };
  byProject: { id: string; title: string; minutes: number; billableMinutes: number; amount: number | null }[];
  byMember: { id: string; name: string; minutes: number; billableMinutes: number; amount: number | null }[];
  entries: { date: string; project: string; task: string; person: string; minutes: number; billable: boolean; note: string; amount: number | null }[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Hours (and money, for admins) spent on a client's projects in a period, with CSV and print. */
export function CompanyTimeReport({ companyId }: { companyId: string }) {
  const t = useTranslations("time");
  const locale = useLocale();
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))));
  const [to, setTo] = useState(iso(now));
  const [currency, setCurrency] = useState("EUR");
  const qs = `from=${from}&to=${to}&currency=${currency}`;
  const { data, error, isLoading } = useQuery({
    queryKey: ["time-report", companyId, from, to, currency],
    enabled: /^[A-Za-z]{3}$/.test(currency) && from <= to,
    queryFn: () => api.get<Report>(`/api/v1/companies/${companyId}/time-report?${qs}`),
  });
  const money = (v: number | null) => (v === null ? "" : new Intl.NumberFormat(locale, { style: "currency", currency: data?.currency ?? currency }).format(v));

  return (
    <div className="flex flex-col gap-4" data-testid="time-report">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("from")}
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {t("to")}
          <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="flex w-24 flex-col gap-1 text-xs text-muted-foreground">
          {t("currency")}
          <Input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </label>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/v1/companies/${companyId}/time-report?${qs}&format=csv`, "_blank", "noopener")}>
            <Download className="size-4" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" />
            {t("print")}
          </Button>
        </div>
      </div>

      {error instanceof ApiFailure && (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">…</p>}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label={t("hours")} value={formatMinutes(data.totals.minutes)} />
            <Stat label={t("billableHours")} value={formatMinutes(data.totals.billableMinutes)} />
            {data.showMoney ? <Stat label={t("amount")} value={money(data.totals.amount)} /> : <Stat label={t("amount")} value="—" hint={t("moneyHidden")} />}
          </div>

          <Table
            title={t("byProject")}
            head={[t("project"), t("hours"), t("billableHours"), ...(data.showMoney ? [t("amount")] : [])]}
            rows={data.byProject.map((r) => [r.title, formatMinutes(r.minutes), formatMinutes(r.billableMinutes), ...(data.showMoney ? [money(r.amount)] : [])])}
          />
          <Table
            title={t("byPerson")}
            head={[t("person"), t("hours"), t("billableHours"), ...(data.showMoney ? [t("amount")] : [])]}
            rows={data.byMember.map((r) => [r.name, formatMinutes(r.minutes), formatMinutes(r.billableMinutes), ...(data.showMoney ? [money(r.amount)] : [])])}
          />
          <Table
            title={t("entries")}
            head={[t("date"), t("project"), t("task"), t("person"), t("hours"), ...(data.showMoney ? [t("amount")] : [])]}
            rows={data.entries.map((e) => [e.date, e.project, e.task, e.person, `${formatMinutes(e.minutes)}${e.billable ? "" : ` (${t("nonBillable")})`}`, ...(data.showMoney ? [money(e.amount)] : [])])}
          />
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  if (rows.length === 0) return null;
  return (
    <section className="overflow-x-auto rounded-lg border border-border bg-card">
      <h3 className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            {head.map((h, i) => (
              <th key={h + i} className={`px-3 py-1.5 font-medium ${i === 0 ? "text-left" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => (
                <td key={j} className={`px-3 py-1.5 ${j === 0 ? "text-left" : "text-right tabular-nums"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
