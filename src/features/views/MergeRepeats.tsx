"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Repeat } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";
import { reload } from "@/features/mindmap/actions";
import type { Freq } from "@/modules/nodes/repeat";
import { repeatLabel } from "./repeat-label";

interface Found {
  keepId: string;
  title: string;
  count: number;
  extra: number;
  first: string;
  last: string;
  time: string;
  freq: Freq;
  interval: number;
  skipped: number;
}

/**
 * "Merge repeats": shows up only when a project holds events that are one meeting entered date after date, lists what it found,
 * and merges what the person leaves ticked. Each group becomes one repeating event; the copies are archived, not deleted.
 */
export function MergeRepeats({ projectId }: { projectId: string }) {
  const t = useTranslations("views");
  const tc = useTranslations("common");
  const locale = useLocale();
  const qc = useQueryClient();
  const key = ["project-repeats", projectId];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<{ series: Found[] }>(`/api/v1/projects/${projectId}/repeats`), staleTime: 15_000 });
  const [open, setOpen] = useState(false);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const found = data?.series ?? [];
  const chosen = found.filter((s) => !off.has(s.keepId));
  const day = (d: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

  async function merge() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ merged: number; archived: number }>(`/api/v1/projects/${projectId}/repeats`, { keep: chosen.map((s) => s.keepId) });
      await reload();
      await qc.invalidateQueries({ queryKey: key });
      await qc.invalidateQueries({ queryKey: ["calendar"] });
      setOpen(false);
      setDone(t("mergeDone", { merged: r.merged, archived: r.archived }));
      setTimeout(() => setDone(null), 8000);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : t("mergeFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {found.length > 0 && (
        <Button size="sm" variant="outline" onClick={() => (setOff(new Set()), setError(null), setOpen(true))} data-testid="merge-repeats">
          <Repeat className="size-4" />
          <span className="max-lg:sr-only">{t("mergeRepeats")}</span>
          <span className="rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold tabular-nums text-primary">{found.length}</span>
        </Button>
      )}
      {done && (
        <span role="status" className="text-xs text-muted-foreground" data-testid="merge-done">
          {done}
        </span>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={t("mergeTitle")} wide>
        <p className="text-sm text-muted-foreground">{t("mergeIntro")}</p>
        <ul className="flex flex-col gap-2" data-testid="merge-list">
          {found.map((s) => (
            <li key={s.keepId}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:border-primary">
                <input type="checkbox" className="mt-1" checked={!off.has(s.keepId)} onChange={(e) => setOff((o) => { const n = new Set(o); if (e.target.checked) n.delete(s.keepId); else n.add(s.keepId); return n; })} />
                <span className="flex min-w-0 flex-col gap-0.5 text-sm">
                  <span className="font-medium">{s.title}</span>
                  <span className="text-xs text-muted-foreground">{t("mergeInfo", { n: s.count, first: day(s.first), last: day(s.last) })}</span>
                  <span className="text-xs text-foreground/80">{t("mergeResult", { rule: repeatLabel(t, s), time: s.time })}{s.skipped > 0 ? ` · ${t("mergeSkipped", { n: s.skipped })}` : ""}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t("mergeEndNote")}</p>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {tc("cancel")}
          </Button>
          <Button type="button" disabled={busy || chosen.length === 0} onClick={() => void merge()} data-testid="merge-confirm">
            {t("mergeSelected", { n: chosen.length })}
          </Button>
        </div>
      </Modal>
    </>
  );
}
