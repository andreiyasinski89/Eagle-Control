"use client";

import { useCallback, useEffect, useState } from "react";
import { Square, Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

interface Running {
  nodeId: string;
  title: string;
  projectId: string | null;
  slug: string;
  startedAt: string;
}

const clock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** The running timer, visible on every page. Ticks locally; re-reads the server when something starts or stops it. */
export function TimerChip() {
  const t = useTranslations("time");
  const [timer, setTimer] = useState<Running | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/timer");
      if (res.ok) setTimer(((await res.json()) as { timer: Running | null }).timer);
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
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [timer]);

  if (!timer) return null;
  const seconds = Math.max(0, Math.floor((now - new Date(timer.startedAt).getTime()) / 1000));
  const href = timer.projectId ? `/w/${timer.slug}/projects/p/${timer.projectId}?node=${timer.nodeId}` : `/w/${timer.slug}/projects`;

  async function stop() {
    await fetch("/api/v1/timer/stop", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    setTimer(null);
    window.dispatchEvent(new Event("meetowl:timer-stopped"));
  }

  return (
    <div data-testid="timer-chip" className="flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-sm">
      <Timer className="size-4 text-primary" aria-hidden />
      <Link href={href} className="max-w-40 truncate hover:underline" title={timer.title}>
        {timer.title}
      </Link>
      <span className="tabular-nums" aria-live="off">
        {clock(seconds)}
      </span>
      <button type="button" onClick={() => void stop()} aria-label={t("stop")} className="rounded-full p-1 hover:bg-card">
        <Square className="size-3.5 fill-current" />
      </button>
    </div>
  );
}
