"use client";

import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  /** Server-side sort key; omit for columns that cannot be sorted. */
  sortKey?: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface Props<T extends { id: string }> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  selected?: ReadonlySet<string>;
  onSelect?: (next: Set<string>) => void;
  sort?: { key: string; dir: "asc" | "desc" };
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  activeId?: string | null;
  empty: string;
  label: string;
}

export function DataTable<T extends { id: string }>({ columns, rows, loading, selected, onSelect, sort, onSort, onRowClick, activeId, empty, label }: Props<T>) {
  const t = useTranslations("crm");
  const allChecked = rows.length > 0 && selected && rows.every((r) => selected.has(r.id));
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[640px] text-sm" aria-label={label} aria-busy={loading}>
        <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {onSelect && (
              <th className="w-10 px-3 py-2">
                <input type="checkbox" aria-label={t("selectAll")} checked={!!allChecked} onChange={(e) => onSelect(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
              </th>
            )}
            {columns.map((c) => (
              <th key={c.key} className={cn("px-3 py-2 font-medium", c.className)} aria-sort={sort && c.sortKey === sort.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                {c.sortKey && onSort ? (
                  <button className="inline-flex items-center gap-1 uppercase hover:text-foreground" onClick={() => onSort(c.sortKey as string)}>
                    {c.header}
                    {sort?.key === c.sortKey && (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (onSelect ? 1 : 0)} className="px-3 py-10 text-center text-muted-foreground">
                {loading ? "…" : empty}
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr
              key={r.id}
              data-testid={`row-${r.id}`}
              className={cn("border-b border-border last:border-0", onRowClick && "cursor-pointer hover:bg-muted/40", activeId === r.id && "bg-primary/5")}
              onClick={() => onRowClick?.(r)}
            >
              {onSelect && (
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={t("selectRow")}
                    checked={selected?.has(r.id) ?? false}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(r.id);
                      else next.delete(r.id);
                      onSelect(next);
                    }}
                  />
                </td>
              )}
              {columns.map((c) => (
                <td key={c.key} className={cn("px-3 py-2", c.className)}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const t = useTranslations("crm");
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>{t("totalRows", { count: total })}</span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t("prevPage")}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t("nextPage")}>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
