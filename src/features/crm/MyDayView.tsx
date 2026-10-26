"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, Check, CheckSquare, Clock, Handshake, UserX } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2.5 text-sm font-semibold">
        <span className={cn("grid size-7 place-items-center rounded-lg bg-accent text-accent-foreground", tone === "red" && "bg-[var(--health-red)]/15 text-[var(--health-red)]", tone === "yellow" && "bg-[var(--health-yellow)]/15 text-[var(--health-yellow)]")}>
          <Icon className="size-4" />
        </span>
        {title}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{count}</span>
      </h2>
      {children}
    </section>
  );
}

/** One number that answers "what is my day like?", with the thing it counts under it. */
function Stat({ value, label, icon: Icon, tone }: { value: number; label: string; icon: typeof Clock; tone?: "red" | "yellow" }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid="myday-stat">
      <span className={cn("grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground", tone === "red" && "bg-[var(--health-red)]/15 text-[var(--health-red)]", tone === "yellow" && "bg-[var(--health-yellow)]/15 text-[var(--health-yellow)]")}>
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block text-2xl font-semibold leading-none tabular-nums">{value}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{label}</span>
      </span>
    </div>
  );
}

export function MyDayView({ workspaceId, slug, workspaceName, userName }: { workspaceId: string; slug: string; workspaceName: string; userName: string | null }) {
  const t = useTranslations("myday");
  const tc = useTranslations("crm");
  const locale = useLocale();
  const qc = useQueryClient();
  // The part of the day is the browser's own clock, known only after mount; until then a neutral greeting keeps server and browser identical.
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => setHour(new Date().getHours()), []);
  const firstName = (userName ?? "").trim().split(/\s+/)[0] ?? "";
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
    <section className="mx-auto flex max-w-4xl flex-col gap-5 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl" data-testid="myday-greeting">
          {t(hour === null ? "hello" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening", { name: firstName ? `, ${firstName}` : "" })}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspaceName} · {data ? new Date(data.date).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) : ""}
        </p>
      </div>
      {isLoading && (
        <div className="flex flex-col gap-4" data-testid="myday-loading">
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-[74px] rounded-2xl" />
            <Skeleton className="h-[74px] rounded-2xl" />
            <Skeleton className="h-[74px] rounded-2xl" />
          </div>
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      )}
      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat value={data.tasks.overdue.length + data.tasks.today.length + data.crmTasks.length} label={t("statTasks")} icon={CheckSquare} tone={data.tasks.overdue.length > 0 ? "red" : undefined} />
          <Stat value={data.events.length + data.scheduled.length} label={t("statMeetings")} icon={CalendarClock} />
          <Stat value={data.dealsNeedingNextStep.length + data.attention.staleDeals.length + data.attention.coldContacts.length} label={t("statAttention")} icon={AlertTriangle} tone="yellow" />
        </div>
      )}
      {data && data.counts.total === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-10 text-center" data-testid="myday-empty">
          <span className="text-4xl" aria-hidden>
            🦉
          </span>
          <p className="font-medium">{t("allClearTitle")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("allClear")}</p>
          <Button asChild variant="soft" size="sm">
            <Link href={`/w/${slug}/projects`}>{t("openProjects")}</Link>
          </Button>
        </div>
      )}
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
