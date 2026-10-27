"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { shortDate } from "@/features/crm/format";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { api } from "@/features/mindmap/api";
import { cn } from "@/lib/utils";

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

/** My to-do list: every task assigned to me, in every project, by when it is due. Tick one to finish it. */
export function MyTasksView({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const t = useTranslations("mytasks");
  const locale = useLocale();
  const qc = useQueryClient();
  const asked = useSearchParams().get("tab");
  const [picked, setPicked] = useState<Tab | null>(() => ((TABS as readonly string[]).includes(asked ?? "") ? (asked as Tab) : null));
  const { data, isLoading, isError } = useQuery({ queryKey: ["my-tasks", workspaceId], queryFn: () => api.get<Lists>(`/api/v1/workspaces/${workspaceId}/my-tasks`) });
  const toggle = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => api.patch(`/api/v1/nodes/${id}`, { status: done ? "DONE" : "TODO" }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["my-tasks"] });
      void qc.invalidateQueries({ queryKey: ["my-day"] });
    },
  });

  // Without an explicit tab: the first one that has something, starting with what is late.
  const tab: Tab = picked ?? (data ? (TABS.find((k) => k !== "done" && data[k].length > 0) ?? "today") : "today");
  const rows = data?.[tab] ?? [];

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-4 p-4 md:p-8" data-testid="my-tasks">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
      </div>
      <div role="tablist" className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 text-sm">
        {TABS.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setPicked(k)} className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5", tab === k ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>
            {t(`tab.${k}`)}
            <span className={cn("rounded-full px-1.5 text-xs tabular-nums", k === "overdue" && (data?.overdue.length ?? 0) > 0 ? "bg-[var(--health-red)]/15 text-[var(--health-red)]" : "bg-background text-muted-foreground")}>{data?.[k].length ?? "·"}</span>
          </button>
        ))}
      </div>
      {isLoading && <SkeletonRows rows={5} />}
      {isError && (
        <p role="alert" className="text-sm text-danger">
          {t("error")}
        </p>
      )}
      {data && rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground" data-testid="my-tasks-empty">
          {t(`empty.${tab}`)}
        </p>
      )}
      {rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card shadow-sm" data-testid="my-tasks-list">
          {rows.map((x) => (
            <li key={x.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <input type="checkbox" className="size-4 shrink-0" aria-label={tab === "done" ? t("reopen") : t("finish")} checked={tab === "done"} disabled={toggle.isPending} onChange={() => toggle.mutate({ id: x.id, done: tab !== "done" })} />
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: `var(--health-${x.health.toLowerCase()})` }} />
              <Link href={`/w/${slug}/projects/p/${x.projectId}?node=${x.id}`} className={cn("min-w-0 flex-1 truncate hover:underline", tab === "done" && "text-muted-foreground line-through")}>
                {x.title}
              </Link>
              <span className="hidden truncate text-xs text-muted-foreground sm:block">{x.projectTitle}</span>
              <span className={cn("shrink-0 text-xs", tab === "overdue" ? "text-[var(--health-red)]" : "text-muted-foreground")}>{x.dueDate ? shortDate(x.dueDate, locale) : t("noDate")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
