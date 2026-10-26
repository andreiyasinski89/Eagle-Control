"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import { updateNode } from "@/features/mindmap/actions";
import { useMapStore } from "@/features/mindmap/store";
import { useSelection } from "@/features/mindmap/useSelection";
import { BOARD_COLUMNS, groupByStatus } from "@/modules/views/views";
import { cn } from "@/lib/utils";
import { initials, usePersonName, useWorkItems } from "./useWorkItems";

type Column = (typeof BOARD_COLUMNS)[number];
const dueLabel = (iso: string | null, locale: string) => (iso ? new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" }) : null);

/** Status board. Drag a card to another column, or use the select on the card (keyboard and touch). */
export function KanbanView({ locale }: { locale: string }) {
  const t = useTranslations("views");
  const tm = useTranslations("map");
  const items = useWorkItems();
  const name = usePersonName();
  const meId = useMapStore((s) => s.meId);
  const role = useMapStore((s) => s.role);
  const { selectedId, select } = useSelection();
  const canWrite = role !== "CLIENT";
  const [onlyMine, setOnlyMine] = useState(false);
  const [over, setOver] = useState<Column | null>(null);

  const visible = onlyMine ? items.filter((i) => i.assigneeId === meId) : items;
  const groups = groupByStatus(visible);
  const move = (id: string, to: Column) => {
    const cur = items.find((i) => i.id === id);
    if (cur && cur.status !== to) void updateNode(id, { status: to });
  };

  return (
    <div className="flex h-full flex-col gap-3 p-4" data-testid="kanban-view">
      <label className="flex w-fit items-center gap-2 text-sm">
        <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
        {t("onlyMine")}
      </label>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
        {BOARD_COLUMNS.map((col) => (
          <section
            key={col}
            aria-label={tm(`status.${col}`)}
            data-testid={`column-${col}`}
            onDragOver={(e) => {
              if (!canWrite) return;
              e.preventDefault();
              setOver(col);
            }}
            onDragLeave={() => setOver((c) => (c === col ? null : c))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/plain");
              if (id && canWrite) move(id, col);
            }}
            className={cn("flex w-64 shrink-0 flex-col rounded-lg border border-border bg-muted/40", over === col && "border-primary bg-primary/10")}
          >
            <h3 className="flex items-center justify-between px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {tm(`status.${col}`)}
              <span className="rounded bg-card px-1.5 py-0.5 tabular-nums">{groups[col].length}</span>
            </h3>
            <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {groups[col].map((i) => {
                const who = name(i.assigneeId);
                const due = dueLabel(i.dueDate, locale);
                return (
                  <li
                    key={i.id}
                    draggable={canWrite}
                    data-testid="kanban-card"
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", i.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className={cn("rounded-md border border-border bg-card p-2 text-sm shadow-sm", canWrite && "cursor-grab", selectedId === i.id && "ring-2 ring-primary")}
                  >
                    <button type="button" className="block w-full text-left font-medium hover:underline" onClick={() => select(i.id)}>
                      {i.title}
                    </button>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="size-2.5 rounded-full" style={{ background: `var(--health-${i.health.toLowerCase()})` }} role="img" aria-label={tm(`health.${i.health}`)} />
                      {i.blocked && <Ban className="size-3.5 text-[var(--health-red)]" aria-label={t("blocked")} />}
                      {due && <span>{due}</span>}
                      {who && (
                        <span className="ml-auto grid size-5 place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-foreground" title={who}>
                          {initials(who)}
                        </span>
                      )}
                    </div>
                    {canWrite && (
                      <select aria-label={t("moveTo", { title: i.title })} className="mt-2 h-7 w-full rounded border border-border bg-card px-1 text-xs" value={i.status} onChange={(e) => move(i.id, e.target.value as Column)}>
                        {BOARD_COLUMNS.map((c) => (
                          <option key={c} value={c}>
                            {tm(`status.${c}`)}
                          </option>
                        ))}
                      </select>
                    )}
                  </li>
                );
              })}
              {groups[col].length === 0 && <li className="px-1 py-4 text-center text-xs text-muted-foreground">{t("emptyColumn")}</li>}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
