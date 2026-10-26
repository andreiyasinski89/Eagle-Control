"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Check, Mail, MessageSquare, Phone, Plus, StickyNote } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/ui/modal";
import { Link } from "@/i18n/navigation";
import { api } from "@/features/mindmap/api";
import { cn } from "@/lib/utils";
import { ActivityDialog } from "./DealDialogs";
import { useMembers } from "./hooks";
import type { ActivityDto, Paged } from "./types";

type Row = ActivityDto & { contactName: string | null; contactId: string | null; companyName: string | null; companyId: string | null; dealTitle: string | null; dealId: string | null };
const ICON = { CALL: Phone, EMAIL: Mail, MEETING: CalendarPlus, NOTE: StickyNote, MESSAGE: MessageSquare, TASK: Check } as const;
const TYPES = ["CALL", "EMAIL", "MEETING", "NOTE", "MESSAGE", "TASK"] as const;

export function ActivitiesView({ workspaceId, slug, canWrite, meId }: { workspaceId: string; slug: string; canWrite: boolean; meId: string }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  const qc = useQueryClient();
  const members = useMembers(workspaceId);
  const [status, setStatus] = useState<"" | "open" | "overdue" | "done">("open");
  const [type, setType] = useState("");
  const [owner, setOwner] = useState(meId);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const params = new URLSearchParams({ page: String(page), pageSize: "50", ...(status ? { status } : {}), ...(type ? { type } : {}), ...(owner ? { ownerId: owner } : {}) });
  const list = useQuery({ queryKey: ["activities", workspaceId, params.toString()], placeholderData: (p) => p, queryFn: () => api.get<Paged<Row>>(`/api/v1/workspaces/${workspaceId}/activities?${params}`) });
  const done = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/activities/${id}`, { completed: true }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["activities"] });
      void qc.invalidateQueries({ queryKey: ["board"] });
    },
  });
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 50));

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className={cn(selectClass, "w-36")} aria-label={t("status")} value={status} onChange={(e) => (setStatus(e.target.value as typeof status), setPage(1))}>
          <option value="open">{t("statusOpen")}</option>
          <option value="overdue">{t("statusOverdue")}</option>
          <option value="done">{t("statusDone")}</option>
          <option value="">{t("statusAll")}</option>
        </select>
        <select className={cn(selectClass, "w-36")} aria-label={t("activityType")} value={type} onChange={(e) => (setType(e.target.value), setPage(1))}>
          <option value="">{t("allTypes")}</option>
          {TYPES.map((x) => (
            <option key={x} value={x}>
              {t(`activity.${x}`)}
            </option>
          ))}
        </select>
        <select className={cn(selectClass, "w-44")} aria-label={t("owner")} value={owner} onChange={(e) => (setOwner(e.target.value), setPage(1))}>
          <option value="">{t("allOwners")}</option>
          <option value={meId}>{t("mine")}</option>
          {members.data?.filter((m) => m.id !== meId).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.email}
            </option>
          ))}
        </select>
        {canWrite && (
          <Button className="ml-auto" size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {t("logActivity")}
          </Button>
        )}
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border bg-card" aria-label={t("tabActivities")}>
        {list.data?.items.length === 0 && <li className="px-4 py-10 text-center text-sm text-muted-foreground">{list.isLoading ? "…" : t("noActivities")}</li>}
        {list.data?.items.map((a) => {
          const Icon = ICON[a.type];
          const overdue = !a.completedAt && a.dueAt && new Date(a.dueAt) < new Date();
          return (
            <li key={a.id} className="flex items-start gap-3 px-4 py-3 text-sm" data-testid={`activity-${a.id}`}>
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{a.subject}</div>
                <div className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <span>{t(`activity.${a.type}`)}</span>
                  <span className={cn(overdue && "text-[var(--health-red)]")}>{new Date(a.completedAt ?? a.dueAt ?? a.createdAt).toLocaleString(locale)}</span>
                  {a.contactName && a.contactId && (
                    <Link className="hover:underline" href={`/w/${slug}/crm/contacts?contact=${a.contactId}`}>
                      {a.contactName}
                    </Link>
                  )}
                  {a.companyName && a.companyId && (
                    <Link className="hover:underline" href={`/w/${slug}/crm/companies/${a.companyId}`}>
                      {a.companyName}
                    </Link>
                  )}
                  {a.dealTitle && a.dealId && (
                    <Link className="hover:underline" href={`/w/${slug}/crm?deal=${a.dealId}`}>
                      {a.dealTitle}
                    </Link>
                  )}
                  <span>{a.owner.name ?? a.owner.email}</span>
                </div>
              </div>
              {!a.completedAt && canWrite && (
                <Button size="sm" variant="outline" onClick={() => done.mutate(a.id)} disabled={done.isPending}>
                  <Check className="size-4" />
                  {t("markDone")}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{t("totalRows", { count: list.data?.total ?? 0 })}</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ‹
          </Button>
          {page} / {pages}
          <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            ›
          </Button>
        </div>
      </div>
      <ActivityDialog open={creating} onClose={() => setCreating(false)} workspaceId={workspaceId} defaults={{ type: "TASK" }} onSaved={() => void qc.invalidateQueries({ queryKey: ["activities"] })} />
    </div>
  );
}
