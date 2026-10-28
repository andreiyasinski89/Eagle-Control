"use client";

import { useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { addDays, addMonths, monthGrid, weekGrid } from "@/modules/views/views";
import { todayIn } from "@/modules/views/tz";
import { cn } from "@/lib/utils";
import { TimeGrid } from "./TimeGrid";

export type CalendarMode = "month" | "week" | "day";

export interface GridItem {
  id: string;
  title: string;
  /** Day key, YYYY-MM-DD. */
  day: string;
  tone?: "default" | "done" | "red" | "event" | "crm";
  /** In-app link, or a click handler. */
  href?: string;
  onOpen?: () => void;
  /** Start time of day (HH:MM): shown before the title, and where the item sits on the hour grid. No time = an all-day item. */
  time?: string;
  /** End time of day (HH:MM, "24:00" for midnight), for the height on the hour grid. */
  endTime?: string;
  hint?: string;
  /** A date of a repeating event: drawn with the repeat sign. */
  repeat?: boolean;
}

/** The days a calendar shows for an anchor day: 42 cells for a month, 7 for a week, 1 for a day. */
export function visibleDays(mode: CalendarMode, anchor: string): string[] {
  if (mode === "day") return [anchor];
  if (mode === "week") return weekGrid(anchor);
  const [y, m] = anchor.split("-").map(Number) as [number, number];
  return monthGrid(y, m - 1);
}

const TONE: Record<NonNullable<GridItem["tone"]>, string> = {
  default: "bg-primary/15 hover:bg-primary/25",
  done: "bg-muted text-muted-foreground line-through",
  red: "bg-[var(--health-red)]/20 hover:bg-[var(--health-red)]/30",
  event: "bg-sky-500/20 hover:bg-sky-500/30",
  crm: "bg-amber-500/20 hover:bg-amber-500/30",
};

/**
 * Month grid with day cells, or the hourly week/day grid; prev/next/today, and optional drag-to-reschedule.
 * Presentational: the caller owns `anchor`/`mode` and loads the items for `visibleDays`.
 */
export function CalendarGrid({ anchor, mode, onAnchor, onMode, items, onMove, onSlot, actions, timeZone = "UTC" }: { timeZone?: string; anchor: string; mode: CalendarMode; onAnchor: (day: string) => void; onMode: (m: CalendarMode) => void; items: readonly GridItem[]; onMove?: (id: string, day: string) => void; onSlot?: (day: string, time?: string) => void; actions?: React.ReactNode }) {
  const t = useTranslations("views");
  const locale = useLocale();
  const days = visibleDays(mode, anchor);
  const today = todayIn(timeZone);
  const month = anchor.slice(0, 7);
  const [over, setOver] = useState<string | null>(null);
  const byDay = new Map<string, GridItem[]>();
  for (const i of items) byDay.set(i.day, [...(byDay.get(i.day) ?? []), i]);

  const fmt = (opts: Intl.DateTimeFormatOptions, day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, { ...opts, timeZone: "UTC" });
  const step = (dir: 1 | -1) => onAnchor(mode === "month" ? addMonths(anchor, dir) : addDays(anchor, (mode === "week" ? 7 : 1) * dir));
  const title =
    mode === "month"
      ? fmt({ month: "long", year: "numeric" }, anchor)
      : mode === "day"
        ? fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }, anchor)
        : `${fmt({ day: "numeric", month: "short" }, days[0] as string)} – ${fmt({ day: "numeric", month: "short", year: "numeric" }, days[6] as string)}`;

  /** `placed`: drawn as a block on the hour grid (positioned, wrapping text) instead of a one-line chip. */
  const chip = (i: GridItem, placed?: { style: CSSProperties }) => {
    const cls = cn(placed ? "absolute z-10 overflow-hidden rounded px-1.5 py-0.5 text-left text-xs leading-tight" : "block w-full truncate rounded px-1.5 py-0.5 text-left text-xs", TONE[i.tone ?? "default"]);
    const label = (
      <>
        {i.repeat && <Repeat className="mr-1 inline size-3 align-[-1px] opacity-70" aria-label={t("repeatBadge")} />}
        {i.time && <span className="mr-1 tabular-nums opacity-70">{i.time}</span>}
        {i.title}
      </>
    );
    const common = { title: i.hint ? `${i.title} — ${i.hint}` : i.title, "data-testid": "calendar-item", style: placed?.style };
    return i.href ? (
      <Link key={i.id} href={i.href} className={cls} {...common}>
        {label}
      </Link>
    ) : (
      <button
        key={i.id}
        type="button"
        className={cn(cls, onMove && "cursor-grab")}
        draggable={!!onMove}
        onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)}
        onClick={i.onOpen}
        {...common}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col gap-3 p-4" data-testid="calendar-view">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" aria-label={t("prev")} onClick={() => step(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="outline" size="sm" aria-label={t("next")} onClick={() => step(1)}>
          <ChevronRight className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onAnchor(today)}>
          {t("today")}
        </Button>
        <h2 className="min-w-40 text-base font-semibold capitalize" aria-live="polite">
          {title}
        </h2>
        <div className="ml-auto flex items-center gap-2">
        {actions}
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1 text-sm" role="tablist">
          {(["month", "week", "day"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => onMode(m)} className={cn("rounded-md px-3 py-1", mode === m ? "bg-muted font-medium" : "text-muted-foreground")}>
              {t(m)}
            </button>
          ))}
        </div>
        </div>
      </div>

      {mode === "month" ? (
        <>
          <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
            {days.slice(0, 7).map((d) => (
              <div key={d} className="py-1">
                {fmt({ weekday: "short" }, d)}
              </div>
            ))}
          </div>
          <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7 overflow-auto rounded-lg border border-border bg-card">
            {days.map((d) => {
              const list = byDay.get(d) ?? [];
              const shown = list.slice(0, 3);
              return (
                <div
                  key={d}
                  data-day={d}
                  onDragOver={(e) => {
                    if (!onMove) return;
                    e.preventDefault();
                    setOver(d);
                  }}
                  onDragLeave={() => setOver((c) => (c === d ? null : c))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(null);
                    const id = e.dataTransfer.getData("text/plain");
                    if (id && onMove) onMove(id, d);
                  }}
                  onClick={onSlot ? (e) => !(e.target as HTMLElement).closest("[data-testid=calendar-item]") && onSlot(d) : undefined}
                  className={cn("flex min-h-24 flex-col gap-1 border-b border-r border-border p-1", onSlot && "cursor-pointer", d.slice(0, 7) !== month && "bg-muted/40 text-muted-foreground", over === d && "bg-primary/10")}
                >
                  <span className={cn("grid size-6 place-items-center self-end rounded-full text-xs tabular-nums", d === today && "bg-primary font-semibold text-primary-foreground")}>{Number(d.slice(8))}</span>
                  {shown.map((i) => chip(i))}
                  {list.length > shown.length && <span className="px-1 text-xs text-muted-foreground">{t("more", { n: list.length - shown.length })}</span>}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <TimeGrid days={days} items={items} today={today} timeZone={timeZone} onMove={onMove} onSlot={onSlot} renderItem={chip} />
      )}
    </div>
  );
}
