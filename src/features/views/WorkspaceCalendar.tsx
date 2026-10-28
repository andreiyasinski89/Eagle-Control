"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/features/mindmap/api";
import { Link } from "@/i18n/navigation";
import { placeItem } from "@/modules/views/calendar-items";
import { todayIn, zoneLabel } from "@/modules/views/tz";
import { addDays } from "@/modules/views/views";
import { CalendarGrid, visibleDays, type CalendarMode, type GridItem } from "./CalendarGrid";
import { NewEventDialog } from "./NewEventDialog";
import { TimeZoneNotice } from "./TimeZoneNotice";
import { useTimeZone } from "./useTimeZone";

interface Item {
  id: string;
  kind: "task" | "milestone" | "event" | "crm_activity" | "deal_step" | "deal_close";
  title: string;
  at: string;
  endAt: string | null;
  done: boolean;
  href: string;
  context: string | null;
  seriesId?: string;
}

/** Deadlines, events, CRM follow-ups and deal dates for the whole workspace in one calendar, drawn in the person's own time zone. */
export function WorkspaceCalendar({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const t = useTranslations("views");
  const { tz, saved, loaded } = useTimeZone();
  const asked = useSearchParams().get("day");
  const [picked, setAnchor] = useState<string | null>(() => (asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && !Number.isNaN(Date.parse(`${asked}T00:00:00Z`)) ? asked : null));
  const anchor = picked ?? todayIn(tz);
  const [mode, setMode] = useState<CalendarMode>("month");
  const [mine, setMine] = useState(true);
  const [adding, setAdding] = useState<{ day: string; time?: string } | null>(null);
  const days = visibleDays(mode, anchor);
  // The server works in UTC days. A day in another zone can start or end on the neighbouring UTC day, so ask for one more on each side.
  const from = addDays(days[0] as string, -1);
  const to = addDays(days[days.length - 1] as string, 1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["calendar", workspaceId, from, to, mine],
    enabled: loaded,
    queryFn: () => api.get<{ items: Item[] }>(`/api/v1/workspaces/${workspaceId}/calendar?from=${from}&to=${to}&mine=${mine ? 1 : 0}`),
  });

  const grid: GridItem[] = (data?.items ?? []).map((i) => ({
    id: i.id,
    title: i.title,
    ...placeItem(i, tz),
    tone: i.done ? "done" : i.kind === "event" ? "event" : i.kind === "task" || i.kind === "milestone" ? "default" : "crm",
    href: `/w/${slug}${i.href}`,
    hint: [t(`itemKind.${i.kind}`), i.context].filter(Boolean).join(" · "),
    repeat: !!i.seriesId,
  }));

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <h1 className="text-xl font-semibold">{t("calendarTitle")}</h1>
        <label className="ml-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />
          {t("onlyMine")}
        </label>
        {(isLoading || !loaded) && <Skeleton className="h-4 w-12" />}
        {isError && (
          <span role="alert" className="text-xs text-danger">
            {t("error")}
          </span>
        )}
        {loaded && (
          <Link href="/account" className="ml-auto text-xs text-muted-foreground hover:underline" data-testid="tz-label" title={t("tzChange")}>
            {t("tzShown", { zone: zoneLabel(tz) })}
          </Link>
        )}
      </div>
      <TimeZoneNotice saved={saved} />
      <div className="min-h-0 flex-1">
        <CalendarGrid
          anchor={anchor}
          mode={mode}
          timeZone={tz}
          onAnchor={setAnchor}
          onMode={setMode}
          items={grid}
          onSlot={(day, time) => setAdding({ day, time })}
          actions={
            <Button size="sm" onClick={() => setAdding({ day: mode === "month" ? todayIn(tz) : anchor })}>
              <Plus className="size-4" />
              <span className="max-sm:sr-only">{t("newEvent")}</span>
            </Button>
          }
        />
        <NewEventDialog open={adding !== null} onClose={() => setAdding(null)} workspaceId={workspaceId} day={adding?.day ?? anchor} time={adding?.time} />
      </div>
    </div>
  );
}
