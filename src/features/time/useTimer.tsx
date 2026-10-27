"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, Modal, selectClass } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";

export interface RunningTimer {
  nodeId: string | null;
  title: string;
  label: string | null;
  projectId: string | null;
  workspaceId: string;
  slug: string;
  startedAt: string;
}

/** The running timer, shared by the top bar and the Time page: it ticks here, and re-reads the server when something starts or stops it. */
export function useRunningTimer() {
  const [timer, setTimer] = useState<RunningTimer | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/timer");
      if (res.ok) setTimer(((await res.json()) as { timer: RunningTimer | null }).timer);
    } catch {
      /* offline: keep showing the last known state */
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = setInterval(load, 60_000);
    window.addEventListener("meetowl:timer", load);
    return () => {
      clearInterval(poll);
      window.removeEventListener("meetowl:timer", load);
    };
  }, [load]);

  useEffect(() => {
    if (!timer) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [timer]);

  const seconds = timer ? Math.max(0, Math.floor((now - new Date(timer.startedAt).getTime()) / 1000)) : 0;

  const stop = useCallback(async () => {
    await fetch("/api/v1/timer/stop", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    setTimer(null);
    window.dispatchEvent(new Event("meetowl:timer-stopped"));
  }, []);

  return { timer, seconds, stop, reload: load };
}

interface TaskRow {
  id: string;
  title: string;
  projectTitle: string | null;
}
interface MyTasks {
  overdue: TaskRow[];
  today: TaskRow[];
  upcoming: TaskRow[];
  later: TaskRow[];
}

/**
 * "Start the timer": on one of my tasks, or on whatever I am doing, in words ("calls to the list"). It runs until I stop it.
 * Starting while another timer runs stops that one and keeps its time.
 */
export function StartTimerDialog({ open, onClose, workspaceId }: { open: boolean; onClose: () => void; workspaceId: string }) {
  const t = useTranslations("time");
  const tc = useTranslations("common");
  const [label, setLabel] = useState("");
  const [taskId, setTaskId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tasks = useQuery({ queryKey: ["my-tasks", workspaceId, "for-timer"], enabled: open, staleTime: 30_000, queryFn: () => api.get<MyTasks>(`/api/v1/workspaces/${workspaceId}/my-tasks`) });

  useEffect(() => {
    if (!open) return;
    setLabel("");
    setTaskId("");
    setError(null);
  }, [open]);

  const start = useMutation({
    mutationFn: () => api.post("/api/v1/timer/start", taskId ? { nodeId: taskId } : { workspaceId, label: label.trim() || undefined }),
    onSuccess: () => {
      window.dispatchEvent(new Event("meetowl:timer"));
      onClose();
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("error")),
  });

  const groups: [string, TaskRow[]][] = [
    [t("groupOverdue"), tasks.data?.overdue ?? []],
    [t("groupToday"), tasks.data?.today ?? []],
    [t("groupUpcoming"), tasks.data?.upcoming ?? []],
    [t("groupLater"), tasks.data?.later ?? []],
  ];

  return (
    <Modal open={open} onClose={onClose} title={t("startTitle")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          start.mutate();
        }}
      >
        <FormField label={t("whatFor")} hint={t("whatForHint")}>
          <Input value={label} maxLength={200} placeholder={t("whatForPlaceholder")} disabled={!!taskId} onChange={(e) => setLabel(e.target.value)} autoFocus data-testid="timer-label" />
        </FormField>
        <FormField label={t("orTask")}>
          <select className={selectClass} value={taskId} onChange={(e) => setTaskId(e.target.value)} data-testid="timer-task">
            <option value="">{t("noTask")}</option>
            {groups.map(([name, rows]) =>
              rows.length === 0 ? null : (
                <optgroup key={name} label={name}>
                  {rows.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                      {r.projectTitle ? ` · ${r.projectTitle}` : ""}
                    </option>
                  ))}
                </optgroup>
              ),
            )}
          </select>
        </FormField>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="submit" disabled={start.isPending} data-testid="timer-start-confirm">
            {t("startNow")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
