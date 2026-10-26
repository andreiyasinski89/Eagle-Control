"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiFailure } from "@/features/mindmap/api";
import { formatMinutes, parseDuration } from "@/modules/time/time";

interface Entry {
  id: string;
  userId: string;
  userName: string | null;
  minutes: number;
  date: string;
  billable: boolean;
  note: string | null;
}

export const notifyTimer = () => window.dispatchEvent(new Event("meetowl:timer"));
const today = () => new Date().toISOString().slice(0, 10);

/** Time on one task: a start button, a quick manual form and the log. */
export function TimeSection({ nodeId, meId, canWrite, isAdmin }: { nodeId: string; meId: string | null; canWrite: boolean; isAdmin: boolean }) {
  const t = useTranslations("time");
  const qc = useQueryClient();
  const key = ["time", nodeId];
  const { data } = useQuery({ queryKey: key, queryFn: () => api.get<{ items: Entry[] }>(`/api/v1/nodes/${nodeId}/time`) });
  const [duration, setDuration] = useState("");
  const [date, setDate] = useState(today());
  const [billable, setBillable] = useState(true);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => setError(e instanceof ApiFailure ? e.message : t("error"));
  const refresh = () => void qc.invalidateQueries({ queryKey: key });
  const add = useMutation({
    mutationFn: (minutes: number) => api.post(`/api/v1/nodes/${nodeId}/time`, { minutes, date, billable, note: note.trim() || null }),
    onSuccess: () => {
      setDuration("");
      setNote("");
      setError(null);
      refresh();
    },
    onError: fail,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/api/v1/time/${id}`), onSuccess: refresh, onError: fail });
  const start = useMutation({
    mutationFn: () => api.post(`/api/v1/timer/start`, { nodeId }),
    onSuccess: () => {
      notifyTimer();
      refresh();
    },
    onError: fail,
  });

  const items = data?.items ?? [];
  const total = items.reduce((s, e) => s + e.minutes, 0);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const minutes = parseDuration(duration);
    if (minutes === null) return setError(t("badDuration"));
    add.mutate(minutes);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span data-testid="time-total" className="font-medium">
          {t("total", { value: formatMinutes(total) })}
        </span>
        {canWrite && (
          <Button type="button" size="sm" variant="outline" onClick={() => start.mutate()} disabled={start.isPending}>
            <Play className="size-3.5" />
            {t("start")}
          </Button>
        )}
      </div>

      {canWrite && (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input aria-label={t("duration")} placeholder={t("durationPlaceholder")} value={duration} onChange={(e) => setDuration(e.target.value)} className="w-28" />
            <Input aria-label={t("date")} type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Input aria-label={t("note")} placeholder={t("note")} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={billable} onChange={(e) => setBillable(e.target.checked)} />
              {t("billable")}
            </label>
            <Button type="submit" size="sm" disabled={add.isPending || !duration.trim()}>
              {t("log")}
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}

      <ul className="flex flex-col divide-y divide-border text-sm">
        {items.map((e) => (
          <li key={e.id} className="flex items-center gap-2 py-1.5">
            <span className="w-14 shrink-0 font-medium tabular-nums">{formatMinutes(e.minutes)}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {e.userName} · {e.date}
              {!e.billable && ` · ${t("nonBillable")}`}
              {e.note && ` · ${e.note}`}
            </span>
            {(e.userId === meId || isAdmin) && (
              <button type="button" aria-label={t("delete")} className="text-muted-foreground hover:text-danger" onClick={() => remove.mutate(e.id)}>
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="py-2 text-xs text-muted-foreground">{t("none")}</li>}
      </ul>
    </div>
  );
}
