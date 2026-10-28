"use client";

import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { HOUR_PX, DAY_MINUTES, initialFocus, layoutDay, minutesToPx, parseClock, splitTimed } from "@/modules/views/timegrid";
import { zonedParts } from "@/modules/views/tz";
import type { GridItem } from "./CalendarGrid";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const pad = (n: number) => String(n).padStart(2, "0");
const FOLD_KEY = "meetowl.allDayFolded";

/**
 * Day or week as hours down the side, one column per day, like Google Calendar: events sit at their start time and
 * are as tall as they last, overlapping ones share the width, items without a time wait in the "all day" strip,
 * and a red line marks the current time. Presentational; `renderItem` draws one item (optionally as a placed block).
 */
export function TimeGrid({ days, items, today, timeZone = "UTC", onMove, onSlot, renderItem }: { days: string[]; items: readonly GridItem[]; today: string; timeZone?: string; onMove?: (id: string, day: string) => void; onSlot?: (day: string, time?: string) => void; renderItem: (item: GridItem, placed?: { style: CSSProperties }) => ReactNode }) {
  const t = useTranslations("views");
  const locale = useLocale();
  const [over, setOver] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // The "all day" strip can hold dozens of tasks; it folds up so the hours stay in view. The choice is remembered on this device.
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    try {
      setFolded(localStorage.getItem(FOLD_KEY) === "1");
    } catch {
      /* private window: start open */
    }
  }, []);
  const toggleFold = () =>
    setFolded((f) => {
      try {
        localStorage.setItem(FOLD_KEY, f ? "0" : "1");
      } catch {
        /* not remembered */
      }
      return !f;
    });
  const latest = useRef({ items, days, today });
  latest.current = { items, days, today };

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Opens on the working hours instead of midnight. It happens again once, when the first timed items of these days arrive
  // (they load after the grid is shown); later refreshes do not move the view.
  const dayKey = days.join(",");
  const hasTimed = items.some((i) => days.includes(i.day) && parseClock(i.time) !== null);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const { items: list, days: shown, today: day } = latest.current;
    const starts = list.filter((i) => shown.includes(i.day)).flatMap((i) => parseClock(i.time) ?? []);
    const nowMinute = shown.includes(day) ? zonedParts(new Date(), timeZone).minutes : null;
    el.scrollTop = minutesToPx(initialFocus(starts, nowMinute));
  }, [dayKey, hasTimed, timeZone]);

  const byDay = new Map<string, GridItem[]>();
  for (const i of items) byDay.set(i.day, [...(byDay.get(i.day) ?? []), i]);
  const nowMinute = now ? zonedParts(now, timeZone).minutes : null;
  const columns = `3.5rem repeat(${days.length}, minmax(0, 1fr))`;
  const allDayTotal = items.filter((i) => days.includes(i.day) && parseClock(i.time) === null).length;
  const weekday = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" });

  const drop = (d: string) => ({
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      if (!onMove) return;
      e.preventDefault();
      setOver(d);
    },
    onDragLeave: () => setOver((c) => (c === d ? null : c)),
    onDrop: (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setOver(null);
      const id = e.dataTransfer.getData("text/plain");
      if (id && onMove) onMove(id, d);
    },
  });

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card" data-testid="time-grid">
      <div className="sticky top-0 z-20 bg-card">
        <div className="grid border-b border-border" style={{ gridTemplateColumns: columns }}>
          <div />
          {days.map((d) => (
            <div key={d} className="border-l border-border py-1 text-center text-xs font-medium text-muted-foreground">
              <div className="capitalize">{weekday(d)}</div>
              <div className={cn("mx-auto mt-0.5 grid size-8 place-items-center rounded-full text-base tabular-nums", d === today ? "bg-primary font-semibold text-primary-foreground" : "text-foreground")}>{Number(d.slice(8))}</div>
            </div>
          ))}
        </div>
        <div className="grid border-b border-border" style={{ gridTemplateColumns: columns }} data-testid="all-day-row">
          <div className="flex items-center justify-end gap-0.5 px-0.5 py-1 text-right text-[10px] leading-tight text-muted-foreground">
            <span>{t("allDay")}</span>
            <button
              type="button"
              onClick={toggleFold}
              aria-expanded={!folded}
              aria-label={folded ? t("allDayShow", { n: allDayTotal }) : t("allDayHide")}
              title={folded ? t("allDayShow", { n: allDayTotal }) : t("allDayHide")}
              className="grid size-5 shrink-0 place-items-center rounded hover:bg-muted hover:text-foreground"
              data-testid="all-day-toggle"
            >
              {folded ? <ChevronDown className="size-3.5" aria-hidden /> : <ChevronUp className="size-3.5" aria-hidden />}
            </button>
          </div>
          {days.map((d) => (
            <div
              key={d}
              data-day={d}
              {...drop(d)}
              onClick={onSlot ? (e) => !(e.target as HTMLElement).closest("[data-testid=calendar-item]") && onSlot(d) : undefined}
              className={cn("flex flex-col gap-1 border-l border-border p-1", folded ? "min-h-7 items-center justify-center" : "max-h-40 min-h-9 overflow-y-auto", onSlot && "cursor-pointer", over === d && "bg-primary/10")}
            >
              {folded
                ? (() => {
                    const n = splitTimed(byDay.get(d) ?? []).allDay.length;
                    return n > 0 ? (
                      <span className="rounded-full bg-muted px-2 text-[11px] tabular-nums text-muted-foreground" data-testid="all-day-count">
                        {n}
                      </span>
                    ) : null;
                  })()
                : splitTimed(byDay.get(d) ?? []).allDay.map((i) => renderItem(i))}
            </div>
          ))}
        </div>
      </div>

      <div className="relative grid" style={{ gridTemplateColumns: columns, height: HOUR_PX * 24 }} data-testid="hour-grid">
        <div className="relative">
          {HOURS.slice(1).map((h) => (
            <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground" style={{ top: h * HOUR_PX }}>
              {pad(h)}:00
            </span>
          ))}
        </div>
        {days.map((d) => {
          const timed = splitTimed(byDay.get(d) ?? []).timed;
          const byId = new Map(timed.map((i) => [i.id, i]));
          const placed = layoutDay(timed.map((i) => ({ id: i.id, start: parseClock(i.time) as number, end: parseClock(i.endTime) })));
          return (
            <div
              key={d}
              data-day={d}
              {...drop(d)}
              data-testid="day-column"
              onClick={
                onSlot
                  ? (e) => {
                      if ((e.target as HTMLElement).closest("[data-testid=calendar-item]")) return;
                      // Half-hour steps: a click at 10:20 means a meeting at 10:00, at 10:40 means 10:30.
                      const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                      const half = Math.max(0, Math.min(47, Math.floor(y / (HOUR_PX / 2))));
                      onSlot(d, `${pad(Math.floor(half / 2))}:${half % 2 ? "30" : "00"}`);
                    }
                  : undefined
              }
              className={cn("relative border-l border-border", onSlot && "cursor-pointer", over === d && "bg-primary/5")}
            >
              {HOURS.map((h) => (
                <div key={h} className={cn("pointer-events-none absolute inset-x-0", h > 0 && "border-t border-border/70")} style={{ top: h * HOUR_PX }} />
              ))}
              {placed.map((p) => (
                <div key={p.id} className="contents">
                  {renderItem(byId.get(p.id) as GridItem, {
                    style: {
                      top: minutesToPx(p.start),
                      height: Math.max(minutesToPx(p.end - p.start) - 2, 14),
                      left: `calc(${(p.col / p.cols) * 100}% + 1px)`,
                      width: `calc(${100 / p.cols}% - 3px)`,
                    },
                  })}
                </div>
              ))}
              {d === today && nowMinute !== null && nowMinute < DAY_MINUTES && (
                <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-[var(--health-red)]" style={{ top: minutesToPx(nowMinute) }} data-testid="now-line">
                  <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-[var(--health-red)]" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
