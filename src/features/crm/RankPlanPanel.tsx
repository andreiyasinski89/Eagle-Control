"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/ui/modal";
import { api } from "@/features/mindmap/api";
import { AUTO_METRICS, MAX_CRITERIA, MAX_RANKS, type AutoMetric, type Rank, type RankCriterion } from "@/modules/crm/ranks";

interface TrackerData {
  ranks: Rank[];
  canChange: boolean;
}

/** The ladder of ranks of the team: from the lowest to the highest, each with what it takes. Everybody sees it; owners and admins change it. */
export function RankPlanPanel({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("crm");
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["rank-tracker", workspaceId], queryFn: () => api.get<TrackerData>(`/api/v1/workspaces/${workspaceId}/rank-tracker`) });
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (data) setRanks(data.ranks);
  }, [data]);
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/workspaces/${workspaceId}/rank-plan`, { ranks }),
    onSuccess: () => (setNote(t("rankPlanSaved")), void qc.invalidateQueries({ queryKey: ["rank-tracker"] })),
    onError: () => setNote(t("error")),
  });
  if (!data) return null;
  const edit = data.canChange;
  const setRank = (i: number, p: Partial<Rank>) => setRanks((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const setCrit = (i: number, k: number, p: Partial<RankCriterion>) => setRanks((rs) => rs.map((r, j) => (j === i ? { ...r, criteria: r.criteria.map((c, m) => (m === k ? { ...c, ...p } : c)) } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRanks((rs) => {
      const to = i + d;
      if (to < 0 || to >= rs.length) return rs;
      const copy = [...rs];
      [copy[i], copy[to]] = [copy[to] as Rank, copy[i] as Rank];
      return copy;
    });
  const valid = ranks.every((r) => r.name.trim() && r.criteria.every((c) => c.label.trim() && c.target >= 1));
  const btn = "grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-40";

  return (
    <section className="rounded-lg border border-border bg-card p-4" data-testid="rank-plan">
      <h2 className="text-base font-semibold">{t("rankPlanTitle")}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{t("rankPlanHint")}</p>
      <ol className="flex flex-col gap-3">
        {ranks.map((r, i) => (
          <li key={r.id} className="flex flex-col gap-2 rounded-lg border border-border p-3" data-testid="rank-row">
            <div className="flex items-center gap-1">
              <Input aria-label={t("rankName")} className="h-11 min-w-0 flex-1" value={r.name} maxLength={60} disabled={!edit} onChange={(e) => setRank(i, { name: e.target.value })} data-testid="rank-name" />
              {edit && (
                <>
                  <button type="button" aria-label={t("rankUp")} className={btn} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="size-4" />
                  </button>
                  <button type="button" aria-label={t("rankDown")} className={btn} disabled={i === ranks.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="size-4" />
                  </button>
                  <button type="button" aria-label={t("rankRemove")} className={btn} onClick={() => setRanks((rs) => rs.filter((_, j) => j !== i))} data-testid="rank-remove">
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </div>
            <ul className="flex flex-col gap-2">
              {r.criteria.map((c, k) => (
                <li key={c.id} className="grid grid-cols-[1fr_6rem] gap-2 sm:grid-cols-[1fr_6rem_12rem_auto] sm:items-center" data-testid="criterion-row">
                  <Input aria-label={t("rankCriterion")} className="h-11" value={c.label} maxLength={80} disabled={!edit} onChange={(e) => setCrit(i, k, { label: e.target.value })} data-testid="criterion-label" />
                  <Input type="number" inputMode="numeric" min={1} aria-label={t("rankTarget")} className="h-11" value={c.target} disabled={!edit} onChange={(e) => setCrit(i, k, { target: Number(e.target.value) })} data-testid="criterion-target" />
                  <select className={`${selectClass} col-span-2 h-11 sm:col-span-1`} aria-label={t("rankSource")} value={c.auto ?? ""} disabled={!edit} onChange={(e) => setCrit(i, k, { auto: (e.target.value || null) as AutoMetric | null })} data-testid="criterion-source">
                    <option value="">{t("rankManual")}</option>
                    {AUTO_METRICS.map((m) => (
                      <option key={m} value={m}>
                        {t(`rankMetric.${m}`)}
                      </option>
                    ))}
                  </select>
                  {edit && (
                    <button type="button" aria-label={t("rankRemoveCriterion")} className={`${btn} col-span-2 justify-self-end sm:col-span-1`} onClick={() => setRank(i, { criteria: r.criteria.filter((_, m) => m !== k) })}>
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {edit && (
              <Button type="button" variant="ghost" className="min-h-11 w-fit" disabled={r.criteria.length >= MAX_CRITERIA} onClick={() => setRank(i, { criteria: [...r.criteria, { id: `n${Date.now().toString(36)}${r.criteria.length}`, label: "", target: 1, auto: null }] })} data-testid="criterion-add">
                <Plus className="size-4" />
                {t("rankAddCriterion")}
              </Button>
            )}
          </li>
        ))}
      </ol>
      {ranks.length === 0 && <p className="text-sm text-muted-foreground">{t("rankPlanEmpty")}</p>}
      {edit && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-11" disabled={ranks.length >= MAX_RANKS} onClick={() => setRanks((rs) => [...rs, { id: `r${Date.now().toString(36)}${rs.length}`, name: "", criteria: [] }])} data-testid="rank-add">
            <Plus className="size-4" />
            {t("rankAdd")}
          </Button>
          <Button type="button" className="min-h-11" disabled={!valid || save.isPending} onClick={() => (setNote(null), save.mutate())} data-testid="rank-save">
            {t("teamMapSave")}
          </Button>
        </div>
      )}
      {!edit && <p className="mt-2 text-xs text-muted-foreground">{t("rankPlanOwnerOnly")}</p>}
      {note && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {note}
        </p>
      )}
    </section>
  );
}
