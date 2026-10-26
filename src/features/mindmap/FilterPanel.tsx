"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EMPTY_FILTER, filterCriteriaSchema, isEmptyFilter, type FilterCriteria } from "@/modules/nodes/filters";
import { cn } from "@/lib/utils";
import { api } from "./api";
import type { TagDto } from "./MindMapCanvas";
import { useMapStore } from "./store";

interface SavedFilter {
  id: string;
  name: string;
  criteria: unknown;
}

const STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
const HEALTHS = ["GREEN", "YELLOW", "RED"] as const;
const TYPES = ["EPIC", "SPRINT", "TASK", "SUBTASK", "DOCUMENT", "EVENT"] as const;
const DUES = ["overdue", "this_week", "next_week"] as const;

function toggle<T>(list: readonly T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("rounded-full border px-2 py-0.5 text-xs", on ? "border-primary bg-primary/15" : "border-border hover:bg-muted")}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

export function FilterPanel() {
  const t = useTranslations("map");
  const qc = useQueryClient();
  const filter = useMapStore((s) => s.filter);
  const mode = useMapStore((s) => s.filterMode);
  const people = useMapStore((s) => s.people);
  const workspaceId = useMapStore((s) => s.workspaceId);
  const set = (patch: Partial<FilterCriteria>) => useMapStore.getState().setFilter({ ...filter, ...patch });
  const [name, setName] = useState("");

  const tags = useQuery({
    queryKey: ["tags", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => api.get<TagDto[]>(`/api/v1/workspaces/${workspaceId}/tags`),
  });
  const saved = useQuery({
    queryKey: ["saved-filters", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => api.get<SavedFilter[]>(`/api/v1/workspaces/${workspaceId}/saved-filters`),
  });
  const save = useMutation({
    mutationFn: () => api.post(`/api/v1/workspaces/${workspaceId}/saved-filters`, { name, criteria: filter }),
    onSuccess: () => {
      setName("");
      void qc.invalidateQueries({ queryKey: ["saved-filters", workspaceId] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/v1/saved-filters/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["saved-filters", workspaceId] }),
  });

  const apply = (c: unknown) => {
    const parsed = filterCriteriaSchema.safeParse(c);
    if (parsed.success) useMapStore.getState().setFilter(parsed.data);
  };

  return (
    <div className="flex w-80 max-w-[85vw] flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-lg" data-testid="filter-panel">
      <Input
        placeholder={t("filterText")}
        aria-label={t("filterText")}
        value={filter.q ?? ""}
        onChange={(e) => set({ q: e.target.value || undefined })}
      />
      <Row label={t("fStatus")}>
        {STATUSES.map((s) => (
          <Chip key={s} on={filter.statuses.includes(s)} onClick={() => set({ statuses: toggle(filter.statuses, s) })}>
            {t(`status.${s}`)}
          </Chip>
        ))}
      </Row>
      <Row label={t("fHealth")}>
        {HEALTHS.map((h) => (
          <Chip key={h} on={filter.healths.includes(h)} onClick={() => set({ healths: toggle(filter.healths, h) })}>
            <span className="mr-1 inline-block size-2 rounded-full" style={{ background: `var(--health-${h.toLowerCase()})` }} />
            {t(`health.${h}`)}
          </Chip>
        ))}
      </Row>
      <Row label={t("fType")}>
        {TYPES.map((x) => (
          <Chip key={x} on={filter.types.includes(x)} onClick={() => set({ types: toggle(filter.types, x) })}>
            {t(`type.${x}`)}
          </Chip>
        ))}
      </Row>
      <Row label={t("fAssignee")}>
        {Object.values(people).map((p) => (
          <Chip key={p.id} on={filter.assigneeIds.includes(p.id)} onClick={() => set({ assigneeIds: toggle(filter.assigneeIds, p.id) })}>
            {p.name ?? p.email}
          </Chip>
        ))}
      </Row>
      {(tags.data?.length ?? 0) > 0 && (
        <Row label={t("fTags")}>
          {tags.data?.map((x) => (
            <Chip key={x.id} on={filter.tagIds.includes(x.id)} onClick={() => set({ tagIds: toggle(filter.tagIds, x.id) })}>
              {x.name}
            </Chip>
          ))}
        </Row>
      )}
      <Row label={t("fDue")}>
        {DUES.map((d) => (
          <Chip key={d} on={filter.due === d} onClick={() => set({ due: filter.due === d ? null : d })}>
            {t(`due.${d}`)}
          </Chip>
        ))}
      </Row>

      <Row label={t("fMode")}>
        <Chip on={mode === "dim"} onClick={() => useMapStore.getState().setFilterMode("dim")}>
          {t("modeDim")}
        </Chip>
        <Chip on={mode === "hide"} onClick={() => useMapStore.getState().setFilterMode("hide")}>
          {t("modeHide")}
        </Chip>
      </Row>

      <div className="flex flex-col gap-2 border-t border-border pt-2">
        <Row label={t("savedFilters")}>
          {saved.data?.map((f) => (
            <span key={f.id} className="inline-flex items-center overflow-hidden rounded-full border border-border text-xs">
              <button type="button" className="px-2 py-0.5 hover:bg-muted" onClick={() => apply(f.criteria)}>
                {f.name}
              </button>
              <button type="button" aria-label={`${t("delete")} ${f.name}`} className="px-1 py-0.5 text-muted-foreground hover:bg-muted" onClick={() => remove.mutate(f.id)}>
                <Trash2 className="size-3" />
              </button>
            </span>
          ))}
        </Row>
        <div className="flex gap-2">
          <Input placeholder={t("filterName")} aria-label={t("filterName")} value={name} onChange={(e) => setName(e.target.value)} />
          <Button size="sm" disabled={!name.trim() || isEmptyFilter(filter) || save.isPending} onClick={() => save.mutate()}>
            {t("saveFilter")}
          </Button>
        </div>
        <Button variant="outline" size="sm" disabled={isEmptyFilter(filter)} onClick={() => useMapStore.getState().setFilter(EMPTY_FILTER)}>
          {t("clearFilters")}
        </Button>
      </div>
    </div>
  );
}
