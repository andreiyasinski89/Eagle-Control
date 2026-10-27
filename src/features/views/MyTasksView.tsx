"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CornerDownRight, ListPlus, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { shortDate } from "@/features/crm/format";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { api, ApiFailure } from "@/features/mindmap/api";
import { addDays } from "@/modules/views/views";
import { todayIn } from "@/modules/views/tz";
import { cn } from "@/lib/utils";
import { CreateTasksDialog } from "./CreateTasksDialog";
import { useTimeZone } from "./useTimeZone";

interface Subtask {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  assignee: string | null;
  mine: boolean;
}
interface Task {
  id: string;
  title: string;
  type: string;
  status: string;
  dueDate: string | null;
  progress: number;
  health: "GREEN" | "YELLOW" | "RED";
  projectId: string | null;
  projectTitle: string | null;
  subtasks: Subtask[];
  parentTitle: string | null;
}
interface Lists {
  overdue: Task[];
  today: Task[];
  upcoming: Task[];
  later: Task[];
  done: Task[];
}

const TABS = ["overdue", "today", "upcoming", "later", "done"] as const;
type Tab = (typeof TABS)[number];

/** My to-do list: every task assigned to me, in every project, by when it is due, each with its branch of subtasks. Tick one to finish it. */
export function MyTasksView({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const t = useTranslations("mytasks");
  const locale = useLocale();
  const qc = useQueryClient();
  const { userId, tz } = useTimeZone();
  const asked = useSearchParams().get("tab");
  const [picked, setPicked] = useState<Tab | null>(() => ((TABS as readonly string[]).includes(asked ?? "") ? (asked as Tab) : null));
  const [creating, setCreating] = useState(false);
  const [made, setMade] = useState<{ tasks: number; subtasks: number } | null>(null);
  /** Tasks whose branch is folded; every branch starts open, so the small tasks are in view. */
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({ queryKey: ["my-tasks", workspaceId], queryFn: () => api.get<Lists>(`/api/v1/workspaces/${workspaceId}/my-tasks`) });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["my-tasks"] });
    void qc.invalidateQueries({ queryKey: ["my-day"] });
  };
  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => api.patch(`/api/v1/nodes/${id}`, { status: done ? "DONE" : "TODO" }),
    onSettled: refresh,
  });
  const addSubtask = useMutation({
    mutationFn: ({ parentId, title }: { parentId: string; title: string }) => api.post("/api/v1/nodes", { parentId, type: "SUBTASK", title, assigneeId: userId }),
    onSuccess: () => {
      setDraft("");
      setAddingTo(null);
      setError(null);
      refresh();
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("createFailed")),
  });

  // Without an explicit tab: the first one that has something, starting with what is late.
  const tab: Tab = picked ?? (data ? (TABS.find((k) => k !== "done" && data[k].length > 0) ?? "today") : "today");
  const rows = data?.[tab] ?? [];
  const link = (projectId: string | null, id: string) => `/w/${slug}/projects/p/${projectId}?node=${id}`;

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-4 p-4 md:p-8" data-testid="my-tasks">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
        </div>
        <Button onClick={() => setCreating(true)} data-testid="create-tasks">
          <ListPlus className="size-4" />
          {t("createButton")}
        </Button>
      </div>
      {made && (
        <p role="status" className="rounded-lg border border-border bg-card px-3 py-2 text-sm" data-testid="tasks-created">
          {t("created", { tasks: made.tasks, subtasks: made.subtasks })}
        </p>
      )}
      <div role="tablist" className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 text-sm">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setPicked(k)} className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5", tab === k ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>
            {t(`tab.${k}`)}
            <span className={cn("rounded-full px-1.5 text-xs tabular-nums", k === "overdue" && (data?.overdue.length ?? 0) > 0 ? "bg-[var(--health-red)]/15 text-[var(--health-red)]" : "bg-background text-muted-foreground")}>{data?.[k].length ?? "·"}</span>
          </button>
        ))}
      </div>
      {isLoading && <SkeletonRows rows={5} />}
      {(isError || error) && (
        <p role="alert" className="text-sm text-danger">
          {error ?? t("error")}
        </p>
      )}
      {data && rows.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground" data-testid="my-tasks-empty">
          <p>{t(`empty.${tab}`)}</p>
          {tab !== "done" && (
            <Button variant="soft" size="sm" onClick={() => setCreating(true)}>
              <ListPlus className="size-4" />
              {t("createButton")}
            </Button>
          )}
        </div>
      )}
      {rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card shadow-sm" data-testid="my-tasks-list">
          {rows.map((x) => {
            const open = !folded.has(x.id);
            const doneSubs = x.subtasks.filter((s) => s.status === "DONE").length;
            return (
              <li key={x.id} data-testid="my-task" data-task={x.id}>
                <div className="flex items-center gap-2 px-4 py-2.5 text-sm">
                  {x.subtasks.length > 0 ? (
                    <button type="button" aria-label={open ? t("fold") : t("unfold")} aria-expanded={open} onClick={() => setFolded((f) => (f.has(x.id) ? new Set([...f].filter((i) => i !== x.id)) : new Set([...f, x.id])))} className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted">
                      <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
                    </button>
                  ) : (
                    <span className="size-5 shrink-0" aria-hidden />
                  )}
                  <input type="checkbox" className="size-4 shrink-0" aria-label={tab === "done" ? t("reopen") : t("finish")} checked={tab === "done"} disabled={toggle.isPending} onChange={() => toggle.mutate({ id: x.id, done: tab !== "done" })} />
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: `var(--health-${x.health.toLowerCase()})` }} />
                  <span className="min-w-0 flex-1">
                    <Link href={link(x.projectId, x.id)} className={cn("block truncate hover:underline", tab === "done" && "text-muted-foreground line-through")}>
                      {x.title}
                    </Link>
                    {x.parentTitle && (
                      <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <CornerDownRight className="size-3 shrink-0" aria-hidden />
                        {t("subtaskOf", { task: x.parentTitle })}
                      </span>
                    )}
                  </span>
                  {x.subtasks.length > 0 && (
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground" title={t("subtasksCount", { done: doneSubs, total: x.subtasks.length })} data-testid="subtask-counter">
                      {doneSubs}/{x.subtasks.length}
                    </span>
                  )}
                  <span className="hidden truncate text-xs text-muted-foreground sm:block">{x.projectTitle}</span>
                  <span className={cn("shrink-0 text-xs", tab === "overdue" ? "text-[var(--health-red)]" : "text-muted-foreground")}>{x.dueDate ? shortDate(x.dueDate, locale) : t("noDate")}</span>
                  {x.type === "TASK" && tab !== "done" && (
                    <Button size="sm" variant="ghost" aria-label={t("addSubtask")} title={t("addSubtask")} onClick={() => (setAddingTo(addingTo === x.id ? null : x.id), setDraft(""), setFolded((f) => new Set([...f].filter((i) => i !== x.id))))}>
                      <Plus className="size-4" />
                    </Button>
                  )}
                </div>
                {(x.subtasks.length > 0 && open) || addingTo === x.id ? (
                  <ul className="mb-2 ml-11 mr-4 flex flex-col gap-0.5 border-l border-border pl-3" data-testid="subtasks">
                    {open &&
                      x.subtasks.map((s) => (
                        <li key={s.id} className="flex items-center gap-2 py-1 text-sm">
                          <input type="checkbox" className="size-3.5 shrink-0" aria-label={s.status === "DONE" ? t("reopen") : t("finish")} checked={s.status === "DONE"} disabled={toggle.isPending} onChange={() => toggle.mutate({ id: s.id, done: s.status !== "DONE" })} />
                          <Link href={link(x.projectId, s.id)} className={cn("min-w-0 flex-1 truncate hover:underline", s.status === "DONE" && "text-muted-foreground line-through")}>
                            {s.title}
                          </Link>
                          {!s.mine && s.assignee && <span className="shrink-0 truncate text-xs text-muted-foreground">{s.assignee}</span>}
                          {s.dueDate && <span className="shrink-0 text-xs text-muted-foreground">{shortDate(s.dueDate, locale)}</span>}
                        </li>
                      ))}
                    {addingTo === x.id && (
                      <li>
                        <form
                          className="flex items-center gap-2 py-1"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (draft.trim()) addSubtask.mutate({ parentId: x.id, title: draft.trim() });
                          }}
                        >
                          <Input autoFocus value={draft} maxLength={200} placeholder={t("subtaskPlaceholder")} onChange={(e) => setDraft(e.target.value)} className="h-8" aria-label={t("addSubtask")} />
                          <Button type="submit" size="sm" disabled={!draft.trim() || addSubtask.isPending}>
                            {t("add")}
                          </Button>
                        </form>
                      </li>
                    )}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <CreateTasksDialog
        open={creating}
        onClose={() => setCreating(false)}
        workspaceId={workspaceId}
        slug={slug}
        onCreated={(n, due) => {
          setMade(n);
          // Show the new tasks: in the tab their date puts them in, "later or no date" when they have none.
          const today = todayIn(tz);
          setPicked(!due ? "later" : due < today ? "overdue" : due === today ? "today" : due <= addDays(today, 7) ? "upcoming" : "later");
        }}
      />
    </section>
  );
}
