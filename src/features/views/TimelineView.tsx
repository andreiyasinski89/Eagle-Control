"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/features/mindmap/api";
import { updateNode } from "@/features/mindmap/actions";
import { useMapStore } from "@/features/mindmap/store";
import { useSelection } from "@/features/mindmap/useSelection";
import { addDays, BAR_HEIGHT, buildArrows, buildTimeline, isoDay, ROW_HEIGHT, shiftDates } from "@/modules/views/views";
import { cn } from "@/lib/utils";
import { useWorkItems } from "./useWorkItems";

const ZOOMS = { day: 32, week: 14, month: 5 } as const;
type Zoom = keyof typeof ZOOMS;
const LABEL_W = 220;

/**
 * Simplified Gantt: a bar per task from start to due date, dependency arrows for "blocks" links,
 * and horizontal drag to move both dates together.
 */
export function TimelineView() {
  const t = useTranslations("views");
  const locale = useLocale();
  const items = useWorkItems();
  const projectId = useMapStore((s) => s.projectId);
  const role = useMapStore((s) => s.role);
  const { selectedId, select } = useSelection();
  const canWrite = role !== "CLIENT";
  const [zoom, setZoom] = useState<Zoom>("week");
  const px = ZOOMS[zoom];
  const [drag, setDrag] = useState<{ id: string; dx: number } | null>(null);
  const start = useRef<{ x: number; moved: boolean } | null>(null);

  const ordered = useMemo(() => [...items].sort((a, b) => (a.startDate ?? a.dueDate ?? "9").localeCompare(b.startDate ?? b.dueDate ?? "9") || a.title.localeCompare(b.title)), [items]);
  const today = isoDay(new Date());
  const model = useMemo(() => buildTimeline(ordered.filter((i) => i.startDate || i.dueDate), today, px), [ordered, today, px]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const { data: links } = useQuery({
    queryKey: ["block-links", projectId],
    enabled: !!projectId,
    queryFn: () => api.get<{ items: { id: string; fromNodeId: string; toNodeId: string }[] }>(`/api/v1/projects/${projectId}/links`),
  });
  const arrows = useMemo(() => buildArrows(model.bars, links?.items ?? []), [model.bars, links]);
  const width = model.days * px;
  const height = Math.max(model.bars.length, 1) * ROW_HEIGHT;

  const ticks = useMemo(() => {
    const out: { x: number; label: string; major: boolean }[] = [];
    const step = zoom === "day" ? 1 : zoom === "week" ? 7 : 14;
    for (let i = 0; i < model.days; i += step) {
      const d = addDays(model.rangeStart, i);
      out.push({ x: i * px, label: new Date(`${d}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" }), major: d.endsWith("-01") });
    }
    return out;
  }, [model.days, model.rangeStart, px, zoom, locale]);

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

  return (
    <div className="flex h-full flex-col gap-3 p-4" data-testid="timeline-view">
      <div className="flex items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1 text-sm" role="tablist" aria-label={t("zoom")}>
          {(Object.keys(ZOOMS) as Zoom[]).map((z) => (
            <button key={z} role="tab" aria-selected={zoom === z} onClick={() => setZoom(z)} className={cn("rounded-md px-3 py-1", zoom === z ? "bg-muted font-medium" : "text-muted-foreground")}>
              {t(`zoomLevel.${z}`)}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">{t("timelineHint")}</span>
      </div>

      {model.bars.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{t("noDates")}</p>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card">
          <div className="sticky left-0 z-20 shrink-0 border-r border-border bg-card" style={{ width: LABEL_W }}>
            <div className="h-8 border-b border-border" />
            {model.bars.map((b) => {
              const item = byId.get(b.id);
              return (
                <button key={b.id} type="button" onClick={() => select(b.id)} style={{ height: ROW_HEIGHT }} className={cn("block w-full truncate px-3 text-left text-sm hover:bg-muted", selectedId === b.id && "bg-muted font-medium")} title={item?.title}>
                  {item?.title}
                </button>
              );
            })}
          </div>
          <div className="relative" style={{ width }}>
            <div className="sticky top-0 z-10 h-8 border-b border-border bg-card">
              {ticks.map((k) => (
                <span key={k.x} className={cn("absolute top-0 h-8 border-l border-border pl-1 pt-2 text-[11px] text-muted-foreground", k.major && "font-semibold text-foreground")} style={{ left: k.x }}>
                  {k.label}
                </span>
              ))}
            </div>
            <div className="relative" style={{ height }}>
              {ticks.map((k) => (
                <span key={k.x} className="absolute inset-y-0 border-l border-border/60" style={{ left: k.x }} />
              ))}
              {model.todayX !== null && <span data-testid="today-line" className="absolute inset-y-0 w-px bg-primary" style={{ left: model.todayX }} />}
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
                const done = item.status === "DONE" || item.status === "CANCELLED";
                return (
                  <div
                    key={b.id}
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
                    className={cn("absolute select-none overflow-hidden rounded px-1.5 text-xs leading-5 text-white shadow-sm", canWrite ? "cursor-grab touch-none" : "cursor-pointer", selectedId === b.id && "ring-2 ring-primary ring-offset-1", done && "opacity-50")}
                    style={{ left: b.x + dx, top: b.y, width: Math.max(b.w, 6), height: BAR_HEIGHT, background: `var(--health-${item.health.toLowerCase()})` }}
                  >
                    <span className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${item.progress}%` }} />
                    <span className="relative truncate">{b.w > 60 ? item.title : ""}</span>
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
