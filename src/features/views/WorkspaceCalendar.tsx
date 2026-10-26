"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "@/features/mindmap/api";
import { dayOf, isoDay } from "@/modules/views/views";
import { CalendarGrid, visibleDays, type CalendarMode, type GridItem } from "./CalendarGrid";
import { Skeleton } from "@/components/ui/skeleton";

interface Item {
  id: string;
  kind: "task" | "milestone" | "event" | "crm_activity" | "deal_step" | "deal_close";
  title: string;
  at: string;
  endAt: string | null;
  done: boolean;
  href: string;
  context: string | null;
}

const timeOf = (iso: string) => (iso.slice(11, 16) === "00:00" ? undefined : iso.slice(11, 16));
/** Where an event ends on its own day; one that runs past midnight is cut at the end of that day. */
const endTimeOf = (start: string, end: string | null) => (end ? (dayOf(end) === dayOf(start) ? end.slice(11, 16) : "24:00") : undefined);

/** Deadlines, events, CRM follow-ups and deal dates for the whole workspace in one calendar. */
export function WorkspaceCalendar({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const t = useTranslations("views");
  const [anchor, setAnchor] = useState(() => isoDay(new Date()));
  const [mode, setMode] = useState<CalendarMode>("month");
  const [mine, setMine] = useState(true);
  const days = visibleDays(mode, anchor);
  const from = days[0] as string;
  const to = days[days.length - 1] as string;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["calendar", workspaceId, from, to, mine],
    queryFn: () => api.get<{ items: Item[] }>(`/api/v1/workspaces/${workspaceId}/calendar?from=${from}&to=${to}&mine=${mine ? 1 : 0}`),
  });

  const grid: GridItem[] = (data?.items ?? []).map((i) => ({
    id: i.id,
    title: i.title,
    day: dayOf(i.at),
    time: i.kind === "event" || i.kind === "crm_activity" ? timeOf(i.at) : undefined,
    endTime: i.kind === "event" && timeOf(i.at) ? endTimeOf(i.at, i.endAt) : undefined,
    tone: i.done ? "done" : i.kind === "event" ? "event" : i.kind === "task" || i.kind === "milestone" ? "default" : "crm",
    href: `/w/${slug}${i.href}`,
    hint: [t(`itemKind.${i.kind}`), i.context].filter(Boolean).join(" · "),
  }));

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <h1 className="text-xl font-semibold">{t("calendarTitle")}</h1>
        <label className="ml-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          {t("onlyMine")}
        </label>
        {isLoading && <Skeleton className="h-4 w-12" />}
        {isError && (
          <span role="alert" className="text-xs text-danger">
            {t("error")}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <CalendarGrid anchor={anchor} mode={mode} onAnchor={setAnchor} onMode={setMode} items={grid} />
      </div>
    </div>
  );
}
