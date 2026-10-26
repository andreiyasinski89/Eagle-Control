"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, Check, CheckSquare, Clock, Handshake, UserX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { api } from "@/features/mindmap/api";
import { cn } from "@/lib/utils";
import { shortDate } from "./format";
import type { DealCardDto } from "./types";

interface AgileTask {
  id: string;
  title: string;
  dueDate: string | null;
  progress: number;
  health: "GREEN" | "YELLOW" | "RED";
  projectId: string | null;
  projectTitle: string | null;
}
interface CrmItem {
  id: string;
  type: string;
  subject: string;
  dueAt: string | null;
  overdue: boolean;
  contactName: string | null;
  companyName: string | null;
  dealId: string | null;
  dealTitle: string | null;
}
interface MyDay {
  date: string;
  crm: boolean;
  tasks: { overdue: AgileTask[]; today: AgileTask[] };
  events: { id: string; title: string; projectId: string | null; startsAt: string | null; meetingUrl: string | null }[];
  reminders: { id: string; remindAt: string; target: { id: string; title: string; type: string } | null }[];
  crmTasks: CrmItem[];
  scheduled: CrmItem[];
  dealsNeedingNextStep: DealCardDto[];
  attention: { staleDeals: DealCardDto[]; coldContacts: { id: string; name: string; companyName: string | null; lastContactedAt: string | null }[] };
  counts: { total: number };
}

function Block({ title, icon: Icon, count, tone, children }: { title: string; icon: typeof Clock; count: number; tone?: "red" | "yellow"; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Icon className={cn("size-4", tone === "red" && "text-[var(--health-red)]", tone === "yellow" && "text-[var(--health-yellow)]")} />
        {title}
        <span className="rounded-full bg-muted px-2 text-xs tabular-nums">{count}</span>
      </h2>
      {children}
    </section>
  );
}

export function MyDayView({ workspaceId, slug, workspaceName }: { workspaceId: string; slug: string; workspaceName: string }) {
  const t = useTranslations("myday");
  const tc = useTranslations("crm");
  const locale = useLocale();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["my-day", workspaceId], queryFn: () => api.get<MyDay>(`/api/v1/workspaces/${workspaceId}/my-day`) });
  const done = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/activities/${id}`, { completed: true }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["my-day"] }),
  });

  const taskRow = (x: AgileTask) => (
    <li key={x.id} className="flex items-center gap-2 text-sm">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: `var(--health-${x.health.toLowerCase()})` }} />
      <Link href={`/w/${slug}/projects/p/${x.projectId}?node=${x.id}`} className="min-w-0 flex-1 truncate hover:underline">
        {x.title}
      </Link>
      <span className="truncate text-xs text-muted-foreground">{x.projectTitle}</span>
      {x.dueDate && <span className="text-xs text-muted-foreground">{shortDate(x.dueDate, locale)}</span>}
    </li>
  );
  const crmRow = (x: CrmItem) => (
    <li key={x.id} className="flex items-center gap-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="font-medium">{x.subject}</span>
        <span className="block truncate text-xs text-muted-foreground">{[x.contactName, x.companyName, x.dealTitle].filter(Boolean).join(" · ")}</span>
      </span>
      {x.dueAt && <span className={cn("text-xs", x.overdue ? "text-[var(--health-red)]" : "text-muted-foreground")}>{new Date(x.dueAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}</span>}
      <Button size="sm" variant="outline" onClick={() => done.mutate(x.id)} disabled={done.isPending} aria-label={tc("markDone")}>
        <Check className="size-4" />
      </Button>
    </li>
  );
  const dealRow = (d: DealCardDto) => (
    <li key={d.id} className="flex items-center gap-2 text-sm">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: `var(--health-${d.health.toLowerCase()})` }} />
      <Link href={`/w/${slug}/crm?deal=${d.id}`} className="min-w-0 flex-1 truncate hover:underline">
        {d.title}
      </Link>
      <span className="truncate text-xs text-muted-foreground">{d.companyName}</span>
      <span className="text-xs text-muted-foreground">{d.nextStep ? `➜ ${d.nextStep}` : tc("noNextStep")}</span>
    </li>
  );

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{workspaceName} · {data ? new Date(data.date).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : ""}</p>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">…</p>}
      {data && data.counts.total === 0 && <p className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground" data-testid="myday-empty">{t("allClear")}</p>}
      {data && (
        <>
          <Block title={t("overdue")} icon={AlertTriangle} tone="red" count={data.tasks.overdue.length}>
            <ul className="flex flex-col gap-1.5">{data.tasks.overdue.map(taskRow)}</ul>
          </Block>
          <Block title={t("crmTasks")} icon={CheckSquare} tone="red" count={data.crmTasks.length}>
            <ul className="flex flex-col gap-2">{data.crmTasks.map(crmRow)}</ul>
          </Block>
          <Block title={t("today")} icon={CheckSquare} count={data.tasks.today.length}>
            <ul className="flex flex-col gap-1.5">{data.tasks.today.map(taskRow)}</ul>
          </Block>
          <Block title={t("meetings")} icon={CalendarClock} count={data.events.length + data.scheduled.length}>
            <ul className="flex flex-col gap-2">
              {data.events.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium">{e.title}</span>
                  {e.startsAt && <span className="text-xs text-muted-foreground">{new Date(e.startsAt).toLocaleTimeString(locale, { timeStyle: "short" })}</span>}
                  {e.meetingUrl && (
                    <a href={e.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                      {t("join")}
                    </a>
                  )}
                </li>
              ))}
              {data.scheduled.map(crmRow)}
            </ul>
          </Block>
          <Block title={t("needNextStep")} icon={Handshake} tone="yellow" count={data.dealsNeedingNextStep.length}>
            <ul className="flex flex-col gap-1.5">{data.dealsNeedingNextStep.map(dealRow)}</ul>
          </Block>
          <Block title={t("staleDeals")} icon={Clock} tone="red" count={data.attention.staleDeals.length}>
            <ul className="flex flex-col gap-1.5">{data.attention.staleDeals.map(dealRow)}</ul>
          </Block>
          <Block title={t("coldContacts")} icon={UserX} tone="yellow" count={data.attention.coldContacts.length}>
            <ul className="flex flex-col gap-1.5">
              {data.attention.coldContacts.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm">
                  <Link href={`/w/${slug}/crm/contacts?contact=${c.id}`} className="min-w-0 flex-1 truncate hover:underline">
                    {c.name}
                  </Link>
                  <span className="truncate text-xs text-muted-foreground">{c.companyName}</span>
                  <span className="text-xs text-muted-foreground">{c.lastContactedAt ? shortDate(c.lastContactedAt, locale) : tc("neverContacted")}</span>
                </li>
              ))}
            </ul>
          </Block>
          <Block title={t("reminders")} icon={Clock} count={data.reminders.length}>
            <ul className="flex flex-col gap-1.5 text-sm">
              {data.reminders.map((r) => (
                <li key={r.id}>
                  {r.target?.title ?? "—"} <span className="text-xs text-muted-foreground">{shortDate(r.remindAt, locale)}</span>
                </li>
              ))}
            </ul>
          </Block>
        </>
      )}
    </section>
  );
}
