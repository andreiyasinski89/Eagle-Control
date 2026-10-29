"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, ChevronDown, ChevronUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/ui/modal";
import { Link } from "@/i18n/navigation";
import { api } from "@/features/mindmap/api";
import type { AutoValues, Rank, RankState, RankStatus } from "@/modules/crm/ranks";
import { cn } from "@/lib/utils";

interface TrackerData {
  ranks: Rank[];
  state: RankState;
  status: RankStatus;
  auto: AutoValues;
  today: string;
  canChange: boolean;
}

/**
 * The way to the next rank on the home page: the rank the person holds and the one ahead, each criterion with its bar (counted by the platform
 * or typed by hand, with the day it was last set), the days left to the target day and what each day has to bring.
 * Shown once the leaders have written a ladder; until then only they get a pointer to the settings.
 */
export function RankWidget({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  const qc = useQueryClient();
  const key = ["rank-tracker", workspaceId];
  const { data } = useQuery({ queryKey: key, staleTime: 15_000, queryFn: () => api.get<TrackerData>(`/api/v1/workspaces/${workspaceId}/rank-tracker`) });
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: { currentRankId?: string | null; targetDate?: string | null; manual?: Record<string, number> }) => api.put<TrackerData>(`/api/v1/workspaces/${workspaceId}/rank-tracker`, body),
    onSuccess: (r) => (setError(null), setDraft({}), qc.setQueryData(key, r)),
    onError: () => setError(t("error")),
  });
  if (!data) return null;
  if (data.ranks.length === 0) {
    return data.canChange ? (
      <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground" data-testid="rank-setup">
        {t("rankSetupHint")}{" "}
        <Link href={`/w/${slug}/settings/crm`} className="text-primary hover:underline">
          {t("rankSetupLink")}
        </Link>
      </p>
    ) : null;
  }
  const s = data.status;
  const ago = (iso: string | null) => {
    if (!iso) return t("rankNeverSet");
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    return d <= 0 ? t("rankSetToday") : t("rankSetDaysAgo", { n: d });
  };
  const fmt = (n: number) => new Intl.NumberFormat(locale === "uk" ? "uk-UA" : locale, { maximumFractionDigits: 1 }).format(n);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4" data-testid="rank-widget">
      <div className="flex items-center gap-2">
        <Award className="size-5 text-primary" aria-hidden />
        <h2 className="min-w-0 flex-1 text-lg font-semibold">{s.next ? t("rankTitle", { from: s.current?.name ?? t("rankNone"), to: s.next.name }) : t("rankTop", { name: s.current?.name ?? "—" })}</h2>
        <span className="text-xl font-semibold tabular-nums" data-testid="rank-percent">
          {s.percent}%
        </span>
        <button type="button" aria-expanded={open} aria-label={open ? t("collapse") : t("expand")} className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted" onClick={() => setOpen((v) => !v)} data-testid="rank-toggle">
          {open ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
        </button>
      </div>
      <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="block h-full rounded-full bg-primary transition-all" style={{ width: `${s.percent}%` }} />
      </span>
      {s.reached && (
        <p className="rounded-lg bg-[var(--health-green)]/15 p-2 text-sm font-medium" data-testid="rank-reached">
          {t("rankReached", { name: s.next?.name ?? "" })}
        </p>
      )}
      {open && (
        <>
          {s.daysLeft !== null && (
            <p className={cn("text-sm", s.daysLeft < 0 ? "text-danger" : "text-muted-foreground")} data-testid="rank-countdown">
              {s.daysLeft < 0 ? t("rankOverdue", { n: -s.daysLeft }) : s.daysLeft === 0 ? t("rankLastDay") : t("rankDaysLeft", { n: s.daysLeft })}
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {s.criteria.map((c) => (
              <li key={c.id} className="flex flex-col gap-1.5" data-testid="rank-criterion">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="min-w-0 flex-1 font-medium">{c.label}</span>
                  <span className="tabular-nums" data-testid="rank-value">
                    {fmt(c.value)} / {fmt(c.target)}
                  </span>
                </div>
                <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className="block h-full rounded-full" style={{ width: `${c.percent}%`, background: c.percent >= 100 ? "var(--health-green)" : "var(--primary)" }} />
                </span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{c.auto ? t("rankAuto") : `${t("rankManual")} · ${ago(c.updatedAt)}`}</span>
                  {c.left > 0 && c.perDay !== null && <span data-testid="rank-perday">{t("rankPerDay", { n: fmt(c.perDay) })}</span>}
                  {c.left > 0 && c.perDay === null && <span>{t("rankLeft", { n: fmt(c.left) })}</span>}
                </div>
                {!c.auto && (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const v = Number(draft[c.id] ?? c.value);
                      if (Number.isFinite(v) && v >= 0) save.mutate({ manual: { [c.id]: Math.round(v) } });
                    }}
                  >
                    <Input type="number" inputMode="numeric" min={0} aria-label={c.label} className="h-11 w-32" value={draft[c.id] ?? String(c.value)} onChange={(e) => setDraft((d) => ({ ...d, [c.id]: e.target.value }))} data-testid="rank-input" />
                    <Button type="submit" variant="outline" className="min-h-11" disabled={save.isPending || draft[c.id] === undefined} data-testid="rank-update">
                      {t("rankUpdate")}
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("rankCurrent")}
              <select className={cn(selectClass, "h-11")} value={s.current?.id ?? ""} onChange={(e) => save.mutate({ currentRankId: e.target.value || null })} data-testid="rank-current">
                <option value="">{t("rankNone")}</option>
                {data.ranks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              {t("rankTargetDate")}
              <Input type="date" className="h-11" value={s.targetDate ?? ""} min={data.today} onChange={(e) => save.mutate({ targetDate: e.target.value || null })} data-testid="rank-target" />
            </label>
          </div>
          <Link href={`/w/${slug}/crm/day`} className="inline-flex min-h-11 w-fit items-center text-sm text-primary hover:underline" data-testid="rank-norms">
            {t("rankNorms")}
          </Link>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
