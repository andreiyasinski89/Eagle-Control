"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { EyeOff, Maximize2, Minus, Plus, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/features/mindmap/api";
import { undo, updateNode } from "@/features/mindmap/actions";
import { useMapStore } from "@/features/mindmap/store";
import { useSelection } from "@/features/mindmap/useSelection";
import { addDays, BAR_HEIGHT, buildArrows, buildTimeline, isoDay, ROW_HEIGHT, shiftDates } from "@/modules/views/views";
import { cn } from "@/lib/utils";
import { SmartSortDialog } from "./SmartSortDialog";
import { useWorkItems } from "./useWorkItems";

/** Fixed scales; "fit" stretches the whole period across the width of the screen. */
const ZOOMS = { day: 32, week: 14, month: 5 } as const;
type Zoom = keyof typeof ZOOMS | "fit" | "custom";
const PRESETS: Zoom[] = ["fit", "day", "week", "month"];
const LABEL_W = 260;
const HEAD_H = 52;
const MIN_PX = 2;
const MAX_PX = 120;
const HIDE_DONE_KEY = "meetowl.timeline.hideDone";

const clamp = (n: number) => Math.min(MAX_PX, Math.max(MIN_PX, n));
const isDone = (status: string) => status === "DONE" || status === "CANCELLED";

/**
 * Simplified Gantt: a bar per task from start to due date, dependency arrows for "blocks" links,
 * and horizontal drag to move both dates together. It fills the width of the screen by default, can be zoomed in and out,
 * and finished tasks can be hidden so that what is still to do stands out.
 */
export function TimelineView() {
  const t = useTranslations("views");
  const locale = useLocale();
  const items = useWorkItems();
  const projectId = useMapStore((s) => s.projectId);
  const role = useMapStore((s) => s.role);
  const { selectedId, select } = useSelection();
  const canWrite = role !== "CLIENT";
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [custom, setCustom] = useState(14);
  const [hideDone, setHideDone] = useState(false);
  const [boxW, setBoxW] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  const start = useRef<{ x: number; moved: boolean } | null>(null);
  const [sorting, setSorting] = useState(false);
  const [sorted, setSorted] = useState<number | null>(null);

  // The choice to hide finished tasks is remembered on this device.
  useEffect(() => {
    try {
      setHideDone(localStorage.getItem(HIDE_DONE_KEY) === "1");
    } catch {
      /* private window: start with everything shown */
    }
  }, []);
  const toggleHideDone = () =>
    setHideDone((v) => {
      try {
        localStorage.setItem(HIDE_DONE_KEY, v ? "0" : "1");
      } catch {
        /* not remembered */
      }
      return !v;
    });

  const doneCount = useMemo(() => items.filter((i) => isDone(i.status) && (i.startDate || i.dueDate)).length, [items]);
  const ordered = useMemo(
    () =>
      [...items]
        .filter((i) => !(hideDone && isDone(i.status)))
        .sort((a, b) => (a.startDate ?? a.dueDate ?? "9").localeCompare(b.startDate ?? b.dueDate ?? "9") || a.title.localeCompare(b.title)),
    [items, hideDone],
  );
  const today = isoDay(new Date());
  // The past is not drawn: the axis starts today. What ended before today and is finished is simply gone from the chart; what ended before today
  // and is not finished is overdue and stays, at the very beginning, marked red.
  const scheduled = useMemo(() => ordered.filter((i) => (i.startDate || i.dueDate) && !(isDone(i.status) && isoDay(new Date(i.dueDate ?? i.startDate ?? today)) < today)), [ordered, today]);

  // The width the chart may use, kept up to date as the window changes (the box exists only while there is something to draw).
  const empty = scheduled.length === 0;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setBoxW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [empty]);

  const days = useMemo(() => buildTimeline(scheduled, today, 1, { from: today }).days, [scheduled, today]);
  const fitPx = clamp(boxW > LABEL_W ? (boxW - LABEL_W - 2) / days : 14);
  const px = zoom === "fit" ? fitPx : zoom === "custom" ? custom : ZOOMS[zoom];
  const model = useMemo(() => buildTimeline(scheduled, today, px, { from: today }), [scheduled, today, px]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const zoomBy = (f: number) => {
    setCustom(clamp(px * f));
    setZoom("custom");
  };

  const { data: links } = useQuery({
    queryKey: ["block-links", projectId],
    enabled: !!projectId,
    queryFn: () => api.get<{ items: { id: string; fromNodeId: string; toNodeId: string }[] }>(`/api/v1/projects/${projectId}/links`),
  });
  const arrows = useMemo(() => buildArrows(model.bars, links?.items ?? []), [model.bars, links]);
  const width = model.days * px;
  const height = Math.max(model.bars.length, 1) * ROW_HEIGHT;

  // Header: months on top, days (or weeks, when the days are narrow) below; weekends are shaded when there is room.
  const { months, ticks, weekends } = useMemo(() => {
    const month: { x: number; label: string }[] = [];
    const tick: { x: number; label: string; today: boolean }[] = [];
    const weekend: number[] = [];
    const step = px >= 20 ? 1 : px >= 7 ? 7 : 14;
    for (let i = 0; i < model.days; i++) {
      const d = addDays(model.rangeStart, i);
      const date = new Date(`${d}T00:00:00Z`);
      const dow = date.getUTCDay();
      if (i === 0 || d.endsWith("-01")) month.push({ x: i * px, label: date.toLocaleDateString(locale, { month: "long", year: i === 0 || d.endsWith("-01-01") ? "numeric" : undefined, timeZone: "UTC" }) });
      if (px >= 8 && (dow === 0 || dow === 6)) weekend.push(i * px);
      const show = step === 1 || (step === 7 ? dow === 1 : i % 14 === 0);
      if (show) tick.push({ x: i * px, label: step === 1 ? String(date.getUTCDate()) : date.toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" }), today: d === today });
    }
    // A month label needs room: when the next month starts too close, the label is left out (the day numbers still say where the month turns).
    const roomy = month.filter((m, i) => i === month.length - 1 || (month[i + 1] as { x: number }).x - m.x >= 110);
    return { months: roomy, ticks: tick, weekends: weekend };
  }, [model.days, model.rangeStart, px, locale, today]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>, id: string) {
    start.current = { x: e.clientX, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id, dx: 0 });
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    if (Math.abs(dx) > 3) start.current.moved = true;
    setDrag((d) => (d ? { ...d, dx } : d));
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>, id: string) {
    const s = start.current;
    start.current = null;
    setDrag(null);
    if (!s) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (!s.moved) return select(id);
    const days = Math.round((e.clientX - s.x) / px);
    const item = byId.get(id);
    if (canWrite && item && days !== 0) void updateNode(id, shiftDates(item.startDate, item.dueDate, days));
  }

  const seg = (on: boolean) => cn("rounded-md px-3 py-1 text-sm", on ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground");

  return (
    <div className="flex h-full flex-col gap-3 p-4" data-testid="timeline-view">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1" role="tablist" aria-label={t("zoom")}>
          {PRESETS.map((z) => (
            <button key={z} role="tab" aria-selected={zoom === z} onClick={() => setZoom(z)} className={seg(zoom === z)} data-testid={`zoom-${z}`}>
              {z === "fit" ? (
                <span className="inline-flex items-center gap-1.5">
                  <Maximize2 className="size-3.5" aria-hidden />
                  {t("zoomFit")}
                </span>
              ) : (
                t(`zoomLevel.${z}`)
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          <button type="button" aria-label={t("zoomOut")} title={t("zoomOut")} onClick={() => zoomBy(1 / 1.3)} disabled={px <= MIN_PX} className="grid size-7 place-items-center rounded-md hover:bg-muted disabled:opacity-40" data-testid="zoom-out">
            <Minus className="size-4" />
          </button>
          <button type="button" aria-label={t("zoomIn")} title={t("zoomIn")} onClick={() => zoomBy(1.3)} disabled={px >= MAX_PX} className="grid size-7 place-items-center rounded-md hover:bg-muted disabled:opacity-40" data-testid="zoom-in">
            <Plus className="size-4" />
          </button>
        </div>
        <button
          type="button"
          aria-pressed={hideDone}
          onClick={toggleHideDone}
          className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm", hideDone ? "border-primary bg-primary/10 font-medium" : "border-border bg-card text-muted-foreground hover:text-foreground")}
          data-testid="hide-done"
        >
          <EyeOff className="size-4" aria-hidden />
          {t("hideDone")}
          {doneCount > 0 && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{doneCount}</span>}
        </button>
        {canWrite && (
          <Button type="button" size="sm" variant="outline" className="ml-auto shrink-0 whitespace-nowrap" onClick={() => setSorting(true)} data-testid="smart-sort-button" title={t("sortHint")}>
            <Wand2 className="size-4" />
            {t("sortButton")}
          </Button>
        )}
      </div>
      <p className="-mt-1 text-xs text-muted-foreground">{t("timelineHint")}</p>
      {sorted !== null && (
        <p role="status" className="flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-2 text-sm" data-testid="smart-sort-done">
          {t("sortDone", { n: sorted })}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => {
              void undo();
              setSorted(null);
            }}
          >
            {t("sortUndo")}
          </button>
          <button type="button" aria-label={t("sortClose")} className="ml-auto text-muted-foreground hover:text-foreground" onClick={() => setSorted(null)}>
            ×
          </button>
        </p>
      )}
      <SmartSortDialog open={sorting} onClose={() => setSorting(false)} items={items} links={links?.items ?? []} today={today} locale={locale} onDone={(n) => setSorted(n)} />

      {model.bars.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{hideDone && doneCount > 0 ? t("allDoneHidden", { n: doneCount }) : t("noDates")}</p>
      ) : (
        <div ref={box} className="flex min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card" data-testid="timeline-box">
          <div className="sticky left-0 z-20 shrink-0 border-r border-border bg-card" style={{ width: LABEL_W }}>
            <div className="border-b border-border" style={{ height: HEAD_H }} />
            {model.bars.map((b, row) => {
              const item = byId.get(b.id);
              const finished = item ? isDone(item.status) : false;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => select(b.id)}
                  style={{ height: ROW_HEIGHT }}
                  className={cn("flex w-full items-center gap-2 border-b border-border/50 px-3 text-left text-sm hover:bg-muted", row % 2 === 1 && "bg-muted/20", selectedId === b.id && "bg-muted font-medium", finished && "text-muted-foreground line-through")}
                  title={item?.title}
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ background: `var(--health-${(item?.health ?? "GREEN").toLowerCase()})` }} aria-hidden />
                  <span className="truncate">{item?.title}</span>
                </button>
              );
            })}
          </div>
          <div className="relative" style={{ width }}>
            <div className="sticky top-0 z-10 border-b border-border bg-card" style={{ height: HEAD_H }}>
              <div className="relative h-6 overflow-hidden border-b border-border/60">
                {months.map((m) => (
                  <span key={m.x} className="absolute top-0 h-6 whitespace-nowrap border-l border-border pl-2 pt-1 text-xs font-semibold capitalize text-foreground" style={{ left: m.x }}>
                    {m.label}
                  </span>
                ))}
              </div>
              <div className="relative h-7 overflow-hidden">
                {ticks.map((k) => (
                  <span key={k.x} className={cn("absolute top-0 h-7 whitespace-nowrap border-l border-border/60 pl-1 pt-1.5 text-[11px] text-muted-foreground", k.today && "font-semibold text-primary")} style={{ left: k.x }}>
                    {k.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative" style={{ height }}>
              {weekends.map((x) => (
                <span key={x} className="absolute inset-y-0 bg-muted/40" style={{ left: x, width: px }} aria-hidden />
              ))}
              {model.bars.map((b, row) => (
                <span key={b.id} className={cn("absolute inset-x-0 border-b border-border/50", row % 2 === 1 && "bg-muted/20")} style={{ top: row * ROW_HEIGHT, height: ROW_HEIGHT }} aria-hidden />
              ))}
              {model.todayX !== null && (
                <>
                  <span data-testid="today-line" className="absolute inset-y-0 w-0.5 bg-primary" style={{ left: model.todayX }} />
                  <span className="absolute -top-px rounded-b bg-primary px-1.5 text-[10px] font-medium leading-4 text-primary-foreground" style={model.todayX < 28 ? { left: 0 } : { left: model.todayX, transform: "translateX(-50%)" }}>
                    {t("todayLabel")}
                  </span>
                </>
              )}
              <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
                <defs>
                  <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0 0 L8 4 L0 8 z" fill="currentColor" />
                  </marker>
                </defs>
                {arrows.map((a) => (
                  <path
                    key={`${a.from}-${a.to}`}
                    data-testid="dependency"
                    data-conflict={a.conflict}
                    d={`M${a.x1} ${a.y1} C${a.x1 + 24} ${a.y1} ${a.x2 - 24} ${a.y2} ${a.x2} ${a.y2}`}
                    fill="none"
                    strokeWidth={1.5}
                    markerEnd="url(#arrow)"
                    className={a.conflict ? "text-[var(--health-red)]" : "text-muted-foreground"}
                    stroke="currentColor"
                  />
                ))}
              </svg>
              {model.bars.map((b) => {
                const item = byId.get(b.id);
                if (!item) return null;
                const dx = drag?.id === b.id ? Math.round(drag.dx / px) * px : 0;
                const finished = isDone(item.status);
                const wide = b.w > 90;
                return (
                  <div key={b.id} className="absolute flex items-center" style={{ left: b.x + dx, top: b.y, height: BAR_HEIGHT }}>
                    <div
                      role="button"
                      tabIndex={0}
                      data-testid="timeline-bar"
                      aria-label={`${item.title}: ${b.start} – ${b.end}`}
                      onPointerDown={(e) => onPointerDown(e, b.id)}
                      onPointerMove={onPointerMove}
                      onPointerUp={(e) => onPointerUp(e, b.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") select(b.id);
                        if (canWrite && (e.key === "ArrowLeft" || e.key === "ArrowRight")) void updateNode(b.id, shiftDates(item.startDate, item.dueDate, e.key === "ArrowLeft" ? -1 : 1));
                      }}
                      className={cn("relative shrink-0 select-none overflow-hidden px-1.5", b.cut ? "rounded-l-none rounded-r-md" : "rounded-md", b.late && "ring-1 ring-[var(--health-red)]", "text-xs leading-5 text-white shadow-sm", canWrite ? "cursor-grab touch-none" : "cursor-pointer", selectedId === b.id && "ring-2 ring-primary ring-offset-1", finished && "opacity-50")}
                      style={{ width: Math.max(b.w - 2, 8), height: BAR_HEIGHT, background: `var(--health-${item.health.toLowerCase()})` }}
                    >
                      <span className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${item.progress}%` }} />
                      <span className="relative truncate">{wide ? item.title : ""}</span>
                    </div>
                    {/* A short bar has no room for its name: it is written beside it. */}
                    {!wide && (
                      <span className={cn("pointer-events-none ml-2 whitespace-nowrap text-xs", finished ? "text-muted-foreground line-through" : "text-foreground/80")}>
                        {item.title}
                        {b.late && <span className="ml-1.5 text-[var(--health-red)]">{t("overdueSince", { date: new Date(`${(item.dueDate ?? item.startDate ?? today).slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" }) })}</span>}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {model.unscheduled.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">{t("unscheduled", { n: model.unscheduled.length })}</summary>
          <ul className="mt-1 flex flex-wrap gap-2">
            {model.unscheduled.map((id) => (
              <li key={id}>
                <button type="button" className="rounded border border-border bg-card px-2 py-0.5 hover:bg-muted" onClick={() => select(id)}>
                  {byId.get(id)?.title}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
