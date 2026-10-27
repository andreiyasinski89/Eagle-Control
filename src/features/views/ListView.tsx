"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiFailure } from "@/features/mindmap/api";
import { reload, rename, updateNode } from "@/features/mindmap/actions";
import { useMapStore } from "@/features/mindmap/store";
import { useSelection } from "@/features/mindmap/useSelection";
import { sortItems, type SortDir, type SortKey } from "@/modules/views/views";
import { cn } from "@/lib/utils";
import { usePersonName, useWorkItems } from "./useWorkItems";

const STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"] as const;
const selectCls = "h-8 rounded-md border border-border bg-card px-2 text-sm";
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const iso = (v: string) => (v ? `${v}T00:00:00.000Z` : null);

/** Every task as a table: sort, filter, edit in place, and change many at once. */
export function ListView() {
  const t = useTranslations("views");
  const tm = useTranslations("map");
  const items = useWorkItems();
  const name = usePersonName();
  const people = useMapStore((s) => s.people);
  const role = useMapStore((s) => s.role);
  const projectUnit = useMapStore((s) => (s.projectId ? s.nodes[s.projectId]?.estimationUnit : null)) ?? "HOURS";
  const { selectedId, select } = useSelection();
  const canWrite = role !== "CLIENT";

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [assignee, setAssignee] = useState("");
  const [listId, setListId] = useState("");
  const nodes = useMapStore((s) => s.nodes);
  /** The epic or sprint a task sits in: walk up until one is found. */
  const listOf = (id: string): string | null => {
    for (let n = nodes[id]?.parentId ? nodes[nodes[id]!.parentId as string] : undefined, hops = 0; n && hops < 8; n = n.parentId ? nodes[n.parentId] : undefined, hops++) if (n.type === "EPIC" || n.type === "SPRINT") return n.id;
    return null;
  };
  const lists = Object.values(nodes).filter((n) => n.type === "EPIC" || n.type === "SPRINT").sort((a, b) => a.position - b.position);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "due", dir: "asc" });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ status: string; assignee: string; due: string }>({ status: "", assignee: "", due: "" });
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = items.filter((i) => (!needle || i.title.toLowerCase().includes(needle)) && (!status || i.status === status) && (!assignee || (assignee === "none" ? i.assigneeId === null : i.assigneeId === assignee)) && (!listId || listOf(i.id) === listId));
    return sortItems(filtered, sort.key, sort.dir, (id) => name(id));
    // name only reads `people`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, status, assignee, listId, nodes, sort, people]);

  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const sortBy = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  async function applyBulk() {
    const patch: Record<string, unknown> = {};
    if (bulk.status) patch.status = bulk.status;
    if (bulk.assignee) patch.assigneeId = bulk.assignee === "none" ? null : bulk.assignee;
    if (bulk.due) patch.dueDate = iso(bulk.due);
    if (Object.keys(patch).length === 0 || picked.size === 0) return;
    setError(null);
    try {
      await api.post("/api/v1/nodes/batch", { ops: [...picked].map((id) => ({ op: "patch", id, patch })) });
      setPicked(new Set());
      setBulk({ status: "", assignee: "", due: "" });
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : t("error"));
    }
    await reload();
  }

  const head = (k: SortKey, label: string, className?: string) => (
    <th className={cn("px-2 py-2 text-left font-medium", className)} aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => sortBy(k)}>
        {label}
        {sort.key === k && (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );

  const statusOptions = STATUSES.map((s) => (
    <option key={s} value={s}>
      {tm(`status.${s}`)}
    </option>
  ));
  const personOptions = Object.values(people).map((p) => (
    <option key={p.id} value={p.id}>
      {p.name ?? p.email}
    </option>
  ));

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4" data-testid="list-view">
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label={t("search")} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
        <select aria-label={t("status")} className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t("anyStatus")}</option>
          {statusOptions}
        </select>
        {lists.length > 0 && (
          <select aria-label={t("listColumn")} className={selectCls} value={listId} onChange={(e) => setListId(e.target.value)} data-testid="list-filter">
            <option value="">{t("anyList")}</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        )}
        <select aria-label={t("assignee")} className={selectCls} value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">{t("anyone")}</option>
          <option value="none">{t("unassigned")}</option>
          {personOptions}
        </select>
        <span className="ml-auto text-xs text-muted-foreground">{t("count", { n: rows.length })}</span>
      </div>

      {canWrite && picked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 p-2" role="region" aria-label={t("bulk")}>
          <span className="text-sm font-medium">{t("selected", { n: picked.size })}</span>
          <select aria-label={t("setStatus")} className={selectCls} value={bulk.status} onChange={(e) => setBulk({ ...bulk, status: e.target.value })}>
            <option value="">{t("setStatus")}</option>
            {statusOptions}
          </select>
          <select aria-label={t("setAssignee")} className={selectCls} value={bulk.assignee} onChange={(e) => setBulk({ ...bulk, assignee: e.target.value })}>
            <option value="">{t("setAssignee")}</option>
            <option value="none">{t("unassigned")}</option>
            {personOptions}
          </select>
          <Input aria-label={t("setDue")} type="date" value={bulk.due} onChange={(e) => setBulk({ ...bulk, due: e.target.value })} className="w-40" />
          <Button size="sm" onClick={() => void applyBulk()} disabled={!bulk.status && !bulk.assignee && !bulk.due}>
            {t("apply")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
            {t("clear")}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground shadow-[0_1px_0_var(--border)]">
            <tr>
              <th className="w-8 px-2 py-2">{canWrite && <input type="checkbox" aria-label={t("selectAll")} checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.id)))} />}</th>
              {head("title", t("title"))}
              <th className="px-2 py-2 text-left font-medium">{t("listColumn")}</th>
              {head("status", t("status"))}
              {head("assignee", t("assignee"))}
              {head("due", t("due"))}
              {head("progress", t("progress"), "w-20")}
              {head("estimation", t("estimate"), "w-20")}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid="list-row" className={cn("border-t border-border", selectedId === r.id && "bg-muted/60")}>
                <td className="px-2 py-1.5">{canWrite && <input type="checkbox" aria-label={t("selectRow", { title: r.title })} checked={picked.has(r.id)} onChange={() => toggle(r.id)} />}</td>
                <td className="min-w-56 px-2 py-1.5">
                  <input
                    key={r.title}
                    aria-label={t("title")}
                    disabled={!canWrite}
                    defaultValue={r.title}
                    className="w-full rounded bg-transparent px-1 py-0.5 hover:bg-muted focus:bg-card focus:outline-2 focus:outline-primary"
                    onBlur={(e) => void rename(r.id, e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                  {r.blocked && <span className="ml-1 text-xs text-[var(--health-red)]">⛔ {t("blocked")}</span>}
                </td>
                <td className="max-w-40 truncate px-2 py-1.5 text-xs text-muted-foreground" data-testid="list-cell">
                  {nodes[listOf(r.id) ?? ""]?.title ?? "—"}
                </td>
                <td className="px-2 py-1.5">
                  <select aria-label={t("status")} disabled={!canWrite} className={selectCls} value={r.status} onChange={(e) => void updateNode(r.id, { status: e.target.value as (typeof STATUSES)[number] })}>
                    {statusOptions}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <select aria-label={t("assignee")} disabled={!canWrite} className={selectCls} value={r.assigneeId ?? ""} onChange={(e) => void updateNode(r.id, { assigneeId: e.target.value || null })}>
                    <option value="">{t("unassigned")}</option>
                    {personOptions}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <Input aria-label={t("due")} type="date" disabled={!canWrite} value={day(r.dueDate)} onChange={(e) => void updateNode(r.id, { dueDate: iso(e.target.value) })} className="h-8 w-36" />
                </td>
                <td className="px-2 py-1.5 tabular-nums">{r.progress}%</td>
                <td className="whitespace-nowrap px-2 py-1.5 tabular-nums text-muted-foreground">{r.estimation === null ? "" : `${r.estimation} ${(r.estimationUnit ?? projectUnit) === "STORY_POINTS" ? "SP" : "h"}`}</td>
                <td className="px-2 py-1.5">
                  <button type="button" aria-label={t("open", { title: r.title })} className="text-muted-foreground hover:text-foreground" onClick={() => select(r.id)}>
                    <ExternalLink className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-muted-foreground">
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
