"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderPlus, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, Modal, selectClass } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";
import { GROUP_COLORS, MAX_GROUP_DEPTH, descendantIds, type GroupNode } from "@/modules/crm/groups";
import { cn } from "@/lib/utils";
import { SharePanel } from "./SharePanel";
import { useGroups, type GroupDto } from "./useGroups";

/** "all" = everyone, "none" = people in no group, otherwise a group id. */
export type GroupChoice = "all" | "none" | string;

interface Editing {
  /** null = a new group. */
  group: GroupDto | null;
  parentId: string | null;
}

/**
 * The groups of people as a tree on the left of the board: press one to see its people (its subgroups included),
 * add a subgroup, rename, recolour, move or remove a group. Removing a group never removes people.
 */
export function GroupsPanel({ workspaceId, canWrite, value, onChange }: { workspaceId: string; canWrite: boolean; value: GroupChoice; onChange: (v: GroupChoice) => void }) {
  const t = useTranslations("crm");
  const { data, tree } = useGroups(workspaceId);
  const [editing, setEditing] = useState<Editing | null>(null);

  const row = (n: GroupNode<GroupDto>) => {
    const g = n.group;
    const active = value === g.id;
    return (
      <li key={g.id}>
        <div className={cn("group flex items-center gap-1 rounded-md pr-1 text-sm", active ? "bg-primary/10 font-medium" : "hover:bg-muted")} style={{ paddingLeft: `${(n.depth - 1) * 14 + 4}px` }} data-testid="group-row" data-group={g.id}>
          <button type="button" onClick={() => onChange(g.id)} aria-current={active} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: g.color ?? "var(--muted-foreground)" }} aria-hidden />
            <span className="min-w-0 flex-1 truncate">{g.name}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{g.total}</span>
          </button>
          {canWrite && (
            <span className="flex shrink-0 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
              {n.depth < MAX_GROUP_DEPTH && (
                <button type="button" aria-label={t("newSubgroup")} title={t("newSubgroup")} className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground" onClick={() => setEditing({ group: null, parentId: g.id })}>
                  <FolderPlus className="size-3.5" />
                </button>
              )}
              <button type="button" aria-label={t("editGroup")} title={t("editGroup")} className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground" onClick={() => setEditing({ group: g, parentId: g.parentId })}>
                <Pencil className="size-3.5" />
              </button>
            </span>
          )}
        </div>
        {n.children.length > 0 && <ul>{n.children.map(row)}</ul>}
      </li>
    );
  };

  const fixed = (id: GroupChoice, label: string, n: number) => (
    <li>
      <button type="button" onClick={() => onChange(id)} aria-current={value === id} data-testid={`group-${id}`} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", value === id ? "bg-primary/10 font-medium" : "hover:bg-muted")}>
        <Users className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{n}</span>
      </button>
    </li>
  );

  return (
    <nav aria-label={t("groups")} className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto rounded-2xl border border-border bg-card p-2" data-testid="groups-panel">
      <div className="flex items-center justify-between px-2 pb-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("groups")}</h2>
        {canWrite && (
          <button type="button" aria-label={t("newGroup")} title={t("newGroup")} data-testid="new-group" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setEditing({ group: null, parentId: null })}>
            <Plus className="size-4" />
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-0.5">
        {fixed("all", t("allPeople"), data?.all ?? 0)}
        {tree.map(row)}
        {fixed("none", t("noGroup"), data?.ungrouped ?? 0)}
      </ul>
      {data && data.items.length === 0 && <p className="px-2 pt-2 text-xs text-muted-foreground">{t("groupsEmpty")}</p>}
      {editing && <GroupDialog workspaceId={workspaceId} editing={editing} onClose={() => setEditing(null)} onGone={(id) => value === id && onChange("all")} onCreated={(id) => onChange(id)} />}
    </nav>
  );
}

function GroupDialog({ workspaceId, editing, onClose, onGone, onCreated }: { workspaceId: string; editing: Editing; onClose: () => void; onGone: (id: string) => void; onCreated: (id: string) => void }) {
  const t = useTranslations("crm");
  const ts = useTranslations("share");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const { data, options } = useGroups(workspaceId);
  const g = editing.group;
  const [name, setName] = useState(g?.name ?? "");
  const [parentId, setParentId] = useState<string>(editing.parentId ?? "");
  const [color, setColor] = useState<string>(g?.color ?? GROUP_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [name, parentId]);

  // A group cannot move under itself or its own subgroups, nor so deep that the tree passes three levels.
  const own = g ? new Set(descendantIds(data?.items ?? [], g.id)) : new Set<string>();
  const height = g ? Math.max(1, ...[...own].map((id) => depthIn(data?.items ?? [], id) - depthIn(data?.items ?? [], g.id) + 1)) : 1;
  const parents = options.filter((o) => !own.has(o.id) && o.depth + height <= MAX_GROUP_DEPTH);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["groups", workspaceId] });
    void qc.invalidateQueries({ queryKey: ["people", workspaceId] });
  };
  const fail = (e: unknown) => {
    const known = e instanceof ApiFailure ? ({ group_exists: "groupExists", group_too_deep: "groupTooDeep", group_cycle: "groupCycle", group_limit: "groupLimit" } as Record<string, string>)[e.code] : undefined;
    setError(known ? t(known) : t("error"));
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = { name: name.trim(), parentId: parentId || null, color };
      return g ? api.patch<GroupDto>(`/api/v1/contact-groups/${g.id}`, body) : api.post<GroupDto>(`/api/v1/workspaces/${workspaceId}/contact-groups`, body);
    },
    onSuccess: (r) => {
      refresh();
      if (!g) onCreated(r.id);
      onClose();
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/api/v1/contact-groups/${g?.id}`),
    onSuccess: () => {
      refresh();
      if (g) onGone(g.id);
      onClose();
    },
    onError: fail,
  });

  return (
    <Modal open onClose={onClose} title={g ? t("editGroup") : editing.parentId ? t("newSubgroup") : t("newGroup")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) save.mutate();
        }}
      >
        <FormField label={t("groupName")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus data-testid="group-name" />
        </FormField>
        <FormField label={t("groupParent")}>
          <select className={selectClass} value={parentId} onChange={(e) => setParentId(e.target.value)} data-testid="group-parent">
            <option value="">{t("topLevel")}</option>
            {parents.map((o) => (
              <option key={o.id} value={o.id} disabled={o.depth >= MAX_GROUP_DEPTH}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t("groupColor")}</span>
          <div className="flex gap-2" role="radiogroup" aria-label={t("groupColor")}>
            {GROUP_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)} className={cn("size-6 rounded-full border-2", color === c ? "border-foreground" : "border-transparent")} style={{ background: c }} />
            ))}
          </div>
        </div>
        {g && (
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{ts("title")}</span>
            <SharePanel kind="group" id={g.id} />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          {g ? (
            <Button type="button" variant="danger" size="sm" disabled={remove.isPending} onClick={() => window.confirm(t("deleteGroupConfirm", { n: g.own })) && remove.mutate()}>
              <Trash2 className="size-4" />
              {t("deleteGroup")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={save.isPending || !name.trim()} data-testid="group-save">
              {tc("save")}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function depthIn(groups: GroupDto[], id: string): number {
  const by = new Map(groups.map((x) => [x.id, x]));
  let d = 0;
  for (let cur = by.get(id); cur && d < 10; cur = cur.parentId ? by.get(cur.parentId) : undefined) d++;
  return d;
}
