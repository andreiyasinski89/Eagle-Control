"use client";

import { useState } from "react";
import { Panel } from "@xyflow/react";
import { Flame, Focus, Maximize, Redo2, Search, SlidersHorizontal, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { isEmptyFilter } from "@/modules/nodes/filters";
import { cn } from "@/lib/utils";
import { redo, undo } from "./actions";
import { FilterPanel } from "./FilterPanel";
import { useMapStore } from "./store";

interface Props {
  rootId: string;
  selectedId: string | null;
  onFit: () => void;
  onSearch: () => void;
}

export function Toolbar({ rootId, selectedId, onFit, onSearch }: Props) {
  const t = useTranslations("map");
  const heatmap = useMapStore((s) => s.heatmap);
  const focusId = useMapStore((s) => s.focusId);
  const filter = useMapStore((s) => s.filter);
  const canUndo = useMapStore((s) => s.canUndo);
  const canRedo = useMapStore((s) => s.canRedo);
  const notice = useMapStore((s) => s.notice);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtering = !isEmptyFilter(filter);

  return (
    <>
      <Panel position="top-left" className="!m-3 flex flex-col gap-2">
        <div className="flex max-w-[calc(100vw-1.5rem)] items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 shadow-sm" role="toolbar" aria-label={t("toolbar")}>
          <Button variant="ghost" size="sm" onClick={onFit} aria-label={t("fit")} title={t("fit")}>
            <Maximize className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onSearch} aria-label={t("search")} title={`${t("search")} (Ctrl+K)`}>
            <Search className="size-4" />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button variant="ghost" size="sm" disabled={!canUndo} onClick={() => void undo()} aria-label={t("undo")} title={`${t("undo")} (Ctrl+Z)`}>
            <Undo2 className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" disabled={!canRedo} onClick={() => void redo()} aria-label={t("redo")} title={`${t("redo")} (Ctrl+Shift+Z)`}>
            <Redo2 className="size-4" />
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={heatmap}
            className={cn(heatmap && "bg-muted text-[var(--health-red)]")}
            onClick={() => useMapStore.getState().setHeatmap(!heatmap)}
            title={t("heatmap")}
          >
            <Flame className="size-4" />
            <span className="max-md:sr-only">{t("heatmap")}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={focusId !== null}
            className={cn(focusId && "bg-muted")}
            disabled={!focusId && (!selectedId || selectedId === rootId)}
            onClick={() => useMapStore.getState().setFocus(focusId ? null : selectedId)}
            title={t("focus")}
          >
            <Focus className="size-4" />
            <span className="max-md:sr-only">{focusId ? t("exitFocus") : t("focus")}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={filtersOpen}
            className={cn((filtersOpen || filtering) && "bg-muted")}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <SlidersHorizontal className="size-4" />
            <span className="max-md:sr-only">{t("filters")}</span>
            {filtering && <span className="size-1.5 rounded-full bg-primary" />}
          </Button>
        </div>
        {filtersOpen && <FilterPanel />}
      </Panel>

      {notice && (
        <Panel position="bottom-center" className="!mb-6">
          <div role="alert" className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-lg">
            {notice}
            <button className="text-muted-foreground hover:text-foreground" onClick={() => useMapStore.getState().setNotice(null)} aria-label={t("dismiss")}>
              ×
            </button>
          </div>
        </Panel>
      )}
    </>
  );
}
