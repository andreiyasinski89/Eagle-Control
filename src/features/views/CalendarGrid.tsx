"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { addDays, addMonths, isoDay, monthGrid, weekGrid } from "@/modules/views/views";
import { cn } from "@/lib/utils";

export type CalendarMode = "month" | "week";

export interface GridItem {
  id: string;
  title: string;
  /** Day key, YYYY-MM-DD. */
  day: string;
  tone?: "default" | "done" | "red" | "event" | "crm";
  /** In-app link, or a click handler. */
  href?: string;
  onOpen?: () => void;
  /** Time of day shown before the title, when it matters. */
  time?: string;
  hint?: string;
}

/** The days a calendar shows for an anchor day: 42 cells for a month, 7 for a week. */
export function visibleDays(mode: CalendarMode, anchor: string): string[] {
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
 * Month or week grid with day cells, prev/next/today, and optional drag-to-reschedule.
 * Presentational: the caller owns `anchor`/`mode` and loads the items for `visibleDays`.
 */
export function CalendarGrid({ anchor, mode, onAnchor, onMode, items, onMove }: { anchor: string; mode: CalendarMode; onAnchor: (day: string) => void; onMode: (m: CalendarMode) => void; items: readonly GridItem[]; onMove?: (id: string, day: string) => void }) {
  const t = useTranslations("views");
  const locale = useLocale();
  const days = visibleDays(mode, anchor);
  const today = isoDay(new Date());
  const month = anchor.slice(0, 7);
  const [over, setOver] = useState<string | null>(null);
  const byDay = new Map<string, GridItem[]>();
  for (const i of items) byDay.set(i.day, [...(byDay.get(i.day) ?? []), i]);

  const fmt = (opts: Intl.DateTimeFormatOptions, day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, { ...opts, timeZone: "UTC" });
  const step = (dir: 1 | -1) => onAnchor(mode === "month" ? addMonths(anchor, dir) : addDays(anchor, 7 * dir));
  const title = mode === "month" ? fmt({ month: "long", year: "numeric" }, anchor) : `${fmt({ day: "numeric", month: "short" }, days[0] as string)} – ${fmt({ day: "numeric", month: "short", year: "numeric" }, days[6] as string)}`;

  const chip = (i: GridItem) => {
    const cls = cn("block w-full truncate rounded px-1.5 py-0.5 text-left text-xs", TONE[i.tone ?? "default"]);
    const label = (
      <>
        {i.time && <span className="mr-1 tabular-nums opacity-70">{i.time}</span>}
        {i.title}
      </>
    );
    const common = { title: i.hint ? `${i.title} — ${i.hint}` : i.title, "data-testid": "calendar-item" };
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
        <div className="ml-auto flex gap-1 rounded-lg border border-border bg-card p-1 text-sm" role="tablist">
          {(["month", "week"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => onMode(m)} className={cn("rounded-md px-3 py-1", mode === m ? "bg-muted font-medium" : "text-muted-foreground")}>
              {t(m)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground">
        {days.slice(0, 7).map((d) => (
          <div key={d} className="py-1">
            {fmt({ weekday: "short" }, d)}
          </div>
        ))}
      </div>
      <div className={cn("grid min-h-0 flex-1 grid-cols-7 overflow-auto rounded-lg border border-border bg-card", mode === "month" ? "auto-rows-fr" : "auto-rows-[minmax(14rem,1fr)]")}>
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const shown = mode === "month" ? list.slice(0, 3) : list;
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
              className={cn("flex min-h-24 flex-col gap-1 border-b border-r border-border p-1", mode === "month" && d.slice(0, 7) !== month && "bg-muted/40 text-muted-foreground", over === d && "bg-primary/10")}
            >
              <span className={cn("grid size-6 place-items-center self-end rounded-full text-xs tabular-nums", d === today && "bg-primary font-semibold text-primary-foreground")}>{Number(d.slice(8))}</span>
              {shown.map(chip)}
              {list.length > shown.length && <span className="px-1 text-xs text-muted-foreground">{t("more", { n: list.length - shown.length })}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
