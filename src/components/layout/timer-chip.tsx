"use client";

import { useState } from "react";
import { Play, Square, Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { StartTimerDialog, useRunningTimer } from "@/features/time/useTimer";
import { formatClock } from "@/modules/time/time";

/** More than this and the timer was probably forgotten: the chip says so (it never stops on its own). */
const LONG_SECONDS = 8 * 3600;

/**
 * The timer, on every page: a Start button when none runs, and when one runs, what it is on, the clock and a Stop button.
 * It runs until the person stops it.
 */
export function TimerChip({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("time");
  const { timer, seconds, stop } = useRunningTimer();
  const [starting, setStarting] = useState(false);

  if (!timer) {
    return (
      <>
        <button type="button" onClick={() => setStarting(true)} data-testid="timer-start" className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
          <Play className="size-3.5" aria-hidden />
          <span className="max-sm:sr-only">{t("start")}</span>
        </button>
        <StartTimerDialog open={starting} onClose={() => setStarting(false)} workspaceId={workspaceId} />
      </>
    );
  }

  const href = timer.nodeId ? (timer.projectId ? `/w/${timer.slug}/projects/p/${timer.projectId}?node=${timer.nodeId}` : `/w/${timer.slug}/projects`) : `/w/${timer.slug}/time`;
  const long = seconds >= LONG_SECONDS;

  return (
    <div data-testid="timer-chip" className="flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-sm">
      <Timer className="size-4 text-primary" aria-hidden />
      <Link href={href} className="max-w-40 truncate hover:underline max-sm:hidden" title={timer.title || t("noTask")}>
        {timer.title || t("noTask")}
      </Link>
      <span className="tabular-nums" aria-live="off" data-testid="timer-clock">
        {formatClock(seconds)}
      </span>
      {long && (
        <span className="text-xs text-[var(--health-yellow)]" title={t("longRunning")} data-testid="timer-long">
          ⚠
        </span>
      )}
      <button type="button" onClick={() => void stop()} aria-label={t("stop")} title={t("stop")} data-testid="timer-stop" className="rounded-full p-1 hover:bg-card">
        <Square className="size-3.5 fill-current" />
      </button>
    </div>
  );
}
