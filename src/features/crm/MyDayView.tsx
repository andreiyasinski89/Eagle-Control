"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, Check, CheckSquare, ChevronRight, Clock, Handshake, Mail, MessageCircle, Phone, Timer, User, UserX, Users } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { api } from "@/features/mindmap/api";
import { useTimeZone } from "@/features/views/useTimeZone";
import { zonedParts } from "@/modules/views/tz";
import { cn } from "@/lib/utils";
import { shortDate } from "./format";
import type { DealCardDto } from "./types";
import { OnboardingCard } from "@/features/start/OnboardingCard";

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
  durationMin?: number | null;
  overdue: boolean;
  done?: boolean;
  contactId: string | null;
  contactName: string | null;
  companyId: string | null;
  companyName: string | null;
  dealId: string | null;
  dealTitle: string | null;
}
interface ContactDue {
  id: string;
  name: string;
  stage: string;
  temperature: string | null;
  nextStep: string | null;
  nextStepAt: string | null;
  overdue: boolean;
  done: boolean;
}
interface Pair {
  planned: number;
  done: number;
}
interface Plan {
  tasks: Pair;
  meetings: Pair;
  followUps: Pair;
  backlogOpen: number;
  backlogCleared: number;
  trackedMinutes: number;
  planned: number;
  done: number;
  efficiency: number | null;
  productivity: number | null;
}
interface MyDay {
  date: string;
  timeZone: string;
  plan: Plan;
  crm: boolean;
  tasks: { overdue: AgileTask[]; today: AgileTask[] };
  events: { id: string; title: string; projectId: string | null; startsAt: string | null; meetingUrl: string | null }[];
  reminders: { id: string; remindAt: string; target: { id: string; title: string; type: string } | null }[];
  crmTasks: CrmItem[];
  scheduled: CrmItem[];
  crmDay: CrmItem[];
  contactsDue: ContactDue[];
  contactsDone: ContactDue[];
  dealsNeedingNextStep: DealCardDto[];
  attention: { staleDeals: DealCardDto[]; coldContacts: { id: string; name: string; companyName: string | null; lastContactedAt: string | null }[] };
  counts: { total: number };
}

type Focus = "tasks" | "meetings" | "attention";

/** A list of the day with a way into the section it belongs to. */
function Block({ title, icon: Icon, count, tone, href, linkLabel, children, id }: { title: string; icon: typeof Clock; count: number; tone?: "red" | "yellow"; href?: string; linkLabel?: string; children: React.ReactNode; id: string }) {
  if (count === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid={`myday-block-${id}`}>
      <h2 className="mb-3 flex items-center gap-2.5 text-sm font-semibold">
        <span className={cn("grid size-7 place-items-center rounded-lg bg-accent text-accent-foreground", tone === "red" && "bg-[var(--health-red)]/15 text-[var(--health-red)]", tone === "yellow" && "bg-[var(--health-yellow)]/15 text-[var(--health-yellow)]")}>
          <Icon className="size-4" />
        </span>
        {title}
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{count}</span>
        {href && (
          <Link href={href} className="ml-auto flex items-center gap-0.5 text-xs font-normal text-primary hover:underline" data-testid={`myday-open-${id}`}>
            {linkLabel}
            <ChevronRight className="size-3.5" />
          </Link>
        )}
      </h2>
      {children}
    </section>
  );
}

/** One number that answers "what is my day like?". Press it to see exactly those items; press again to see everything. */
function Stat({ value, label, icon: Icon, tone, active, onPress, id }: { value: number; label: string; icon: typeof Clock; tone?: "red" | "yellow"; active: boolean; onPress: () => void; id: Focus }) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={active}
      data-testid="myday-stat"
      data-stat={id}
      className={cn("flex items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-none", active ? "border-primary ring-1 ring-primary" : "border-border")}
    >
      <span className={cn("grid size-10 place-items-center rounded-xl bg-accent text-accent-foreground", tone === "red" && "bg-[var(--health-red)]/15 text-[var(--health-red)]", tone === "yellow" && "bg-[var(--health-yellow)]/15 text-[var(--health-yellow)]")}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-2xl font-semibold leading-none tabular-nums">{value}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{label}</span>
      </span>
      <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", active && "rotate-90")} aria-hidden />
    </button>
  );
}

const tone = (pct: number | null) => (pct === null ? "var(--muted-foreground)" : pct >= 80 ? "var(--health-green)" : pct >= 50 ? "var(--health-yellow)" : "var(--health-red)");

/** A ring that fills to a percentage; "—" when there is nothing to measure. */
function Ring({ pct, label }: { pct: number | null; label: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 88 88" className="size-24 shrink-0" role="img" aria-label={`${label}: ${pct === null ? "—" : `${pct}%`}`}>
      <circle cx="44" cy="44" r={r} fill="none" stroke="var(--muted)" strokeWidth="9" />
      {pct !== null && pct > 0 && <circle cx="44" cy="44" r={r} fill="none" stroke={tone(pct)} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 44 44)" />}
      <text x="44" y="50" textAnchor="middle" className="fill-foreground text-[18px] font-semibold tabular-nums">
        {pct === null ? "—" : `${pct}%`}
      </text>
    </svg>
  );
}

/** Planned against done, with a bar. The whole card leads to the place where that kind of thing lives. */
function PlanCard({ title, pair, href, planned, done }: { title: string; pair: Pair; href: string; planned: string; done: string }) {
  const pct = pair.planned > 0 ? Math.min(100, Math.round((Math.min(pair.done, pair.planned) / pair.planned) * 100)) : 0;
  return (
    <Link href={href} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-muted/40" data-testid="plan-card">
      <span className="flex items-center justify-between text-sm font-medium">
        {title}
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
      </span>
      <span className="flex items-baseline gap-4 text-xs text-muted-foreground">
        <span>
          {planned} <b className="ml-1 text-base font-semibold tabular-nums text-foreground">{pair.planned}</b>
        </span>
        <span>
          {done} <b className="ml-1 text-base font-semibold tabular-nums text-foreground">{Math.min(pair.done, pair.planned)}</b>
        </span>
      </span>
      <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: tone(pair.planned > 0 ? pct : null) }} />
      </span>
    </Link>
  );
}

/** The people whose next step is due: a number first, then, folded out, each one by name with a link and a way to close the step. */
function ContactsDueBlock({ title, hint, items, base, locale, stage, onDone, busy, openLabel, expand }: { expand: boolean; title: string; hint: string; items: ContactDue[]; base: string; locale: string; stage: (s: string) => string; onDone: (id: string) => void; busy: boolean; openLabel: string }) {
  const [open, setOpen] = useState(false);
  // Pressing the tasks number is asking to see the tasks: the people are part of them, so the list opens.
  useEffect(() => {
    if (expand) setOpen(true);
  }, [expand]);
  if (items.length === 0) return null;
  const late = items.filter((c) => c.overdue).length;
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid="myday-block-contacts-due">
      <h2 className="flex items-center gap-2.5 text-sm font-semibold">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex flex-1 items-center gap-2.5 text-left focus-visible:outline-none" data-testid="contacts-due-toggle">
          <span className="grid size-7 place-items-center rounded-lg bg-accent text-accent-foreground">
            <Users className="size-4" />
          </span>
          {title}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground" data-testid="contacts-due-count">
            {items.length}
          </span>
          {late > 0 && <span className="rounded-full bg-[var(--health-red)]/15 px-2 py-0.5 text-xs tabular-nums text-[var(--health-red)]">{late}</span>}
          <span className="hidden text-xs font-normal text-muted-foreground sm:inline">{hint}</span>
          <ChevronRight className={cn("ml-auto size-4 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />
        </button>
        <Link href={`${base}/crm/day`} className="flex items-center gap-0.5 text-xs font-normal text-primary hover:underline">
          {openLabel}
          <ChevronRight className="size-3.5" />
        </Link>
      </h2>
      {open && (
        <ul className="mt-3 flex flex-col gap-2 border-t border-border pt-3" data-testid="contacts-due-list">
          {items.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm" data-person={c.id}>
              <span className="min-w-0 flex-1">
                <Link href={`${base}/crm/contacts?contact=${c.id}`} className="font-medium hover:underline">
                  {c.name}
                </Link>
                <span className="block truncate text-xs text-muted-foreground">{[stage(c.stage), c.nextStep].filter(Boolean).join(" · ")}</span>
              </span>
              {c.nextStepAt && <span className={cn("text-xs tabular-nums", c.overdue ? "text-[var(--health-red)]" : "text-muted-foreground")}>{shortDate(c.nextStepAt, locale)}</span>}
              <Button size="sm" variant="outline" onClick={() => onDone(c.id)} disabled={busy} aria-label="✓" data-testid="contacts-due-done">
                <Check className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const TYPE_ICON: Record<string, typeof Phone> = { CALL: Phone, MEETING: CalendarClock, EMAIL: Mail, MESSAGE: MessageCircle, TASK: CheckSquare, CONTACT: User };

/** Everything planned in the CRM for today against what is done; opens into the list, where each item can be ticked off. */
function CrmDayCard({ title, hint, items, planned, done, base, tz, locale, onDone, busy }: { title: string; hint: string; items: CrmItem[]; planned: string; done: string; base: string; tz: string; locale: string; onDone: (x: CrmItem) => void; busy: boolean }) {
  const t = useTranslations("myday");
  const tc = useTranslations("crm");
  const [open, setOpen] = useState(false);
  const total = items.length;
  const finished = items.filter((x) => x.done).length;
  const pct = total > 0 ? Math.round((finished / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm sm:col-span-full" data-testid="crm-day-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} disabled={total === 0} className="flex flex-col gap-2 text-left focus-visible:outline-none disabled:cursor-default" data-testid="crm-day-toggle">
        <span className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            {title}
          </span>
          {total > 0 && <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />}
        </span>
        <span className="flex items-baseline gap-4 text-xs text-muted-foreground">
          <span>
            {planned} <b className="ml-1 text-base font-semibold tabular-nums text-foreground" data-testid="crm-day-planned">{total}</b>
          </span>
          <span>
            {done} <b className="ml-1 text-base font-semibold tabular-nums text-foreground" data-testid="crm-day-done">{finished}</b>
          </span>
          <span className="hidden sm:inline">{hint}</span>
        </span>
        <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: tone(total > 0 ? pct : null) }} />
        </span>
      </button>
      {open && (
        <ul className="mt-1 flex flex-col gap-2 border-t border-border pt-3" data-testid="crm-day-list">
          {items.map((x) => {
            const Icon = TYPE_ICON[x.type] ?? CheckSquare;
            return (
              <li key={x.id} className={cn("flex items-center gap-2 text-sm", x.done && "text-muted-foreground")}>
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-label={x.type === "CONTACT" ? t("contactStep") : tc(`activity.${x.type}`)} />
                <span className="min-w-0 flex-1">
                  <Link href={x.contactId ? `${base}/crm/contacts?contact=${x.contactId}` : x.dealId ? `${base}/crm?deal=${x.dealId}` : `${base}/crm/activities`} className={cn("font-medium hover:underline", x.done && "line-through")}>
                    {x.contactName ?? x.subject}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">{[x.contactName ? x.subject : null, x.companyName, x.dealTitle].filter(Boolean).join(" · ")}</span>
                </span>
                {x.dueAt && <span className="text-xs text-muted-foreground">{new Date(x.dueAt).toLocaleTimeString(locale, { timeStyle: "short", timeZone: tz })}</span>}
                {x.done ? <Check className="size-4 text-[var(--health-green)]" aria-label={tc("markDone")} /> : (
                  <Button size="sm" variant="outline" onClick={() => onDone(x)} disabled={busy} aria-label={tc("markDone")}>
                    <Check className="size-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function MyDayView({ workspaceId, slug, workspaceName, userName }: { workspaceId: string; slug: string; workspaceName: string; userName: string | null }) {
  const t = useTranslations("myday");
  const tc = useTranslations("crm");
  const locale = useLocale();
  const qc = useQueryClient();
  const { tz } = useTimeZone();
  const [focus, setFocus] = useState<Focus | null>(null);
  // The part of the day is the person's own clock, known only after mount; until then a neutral greeting keeps server and browser identical.
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => setHour(Math.floor(zonedParts(new Date(), tz).minutes / 60)), [tz]);
  const firstName = (userName ?? "").trim().split(/\s+/)[0] ?? "";
  const { data, isLoading } = useQuery({ queryKey: ["my-day", workspaceId], queryFn: () => api.get<MyDay>(`/api/v1/workspaces/${workspaceId}/my-day`) });
  const done = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/activities/${id}`, { completed: true }),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["my-day"] }),
  });
  const stepDone = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/contacts/${id}/step-done`, {}),
    onSettled: () => {
      for (const k of ["my-day", "people", "tracker", "contact"]) void qc.invalidateQueries({ queryKey: [k] });
    },
  });
  const base = `/w/${slug}`;
  const press = (f: Focus) => {
    setFocus((cur) => (cur === f ? null : f));
    // The lists are below the numbers: take the eye there, or it looks as if nothing happened.
    setTimeout(() => document.getElementById("myday-lists")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const shows = (f: Focus) => focus === null || focus === f;
  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { timeStyle: "short", timeZone: tz });

  /** Where a CRM item lives: its contact, else its deal, else its company, else the activity list. */
  const crmHref = (x: CrmItem) => (x.contactId ? `${base}/crm/contacts?contact=${x.contactId}` : x.dealId ? `${base}/crm?deal=${x.dealId}` : x.companyId ? `${base}/crm/companies/${x.companyId}` : `${base}/crm/activities`);

  const taskRow = (x: AgileTask) => (
    <li key={x.id} className="flex items-center gap-2 text-sm">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: `var(--health-${x.health.toLowerCase()})` }} />
      <Link href={`${base}/projects/p/${x.projectId}?node=${x.id}`} className="min-w-0 flex-1 truncate hover:underline">
        {x.title}
      </Link>
      <span className="truncate text-xs text-muted-foreground">{x.projectTitle}</span>
      {x.dueDate && <span className="text-xs text-muted-foreground">{shortDate(x.dueDate, locale)}</span>}
    </li>
  );
  const crmRow = (x: CrmItem) => (
    <li key={x.id} className="flex items-center gap-2 text-sm">
      <span className="min-w-0 flex-1">
        <Link href={crmHref(x)} className="font-medium hover:underline">
          {x.subject}
        </Link>
        <span className="block truncate text-xs text-muted-foreground">{[x.contactName, x.companyName, x.dealTitle].filter(Boolean).join(" · ")}</span>
      </span>
      {x.dueAt && (
        <Link href={`${base}/calendar?day=${zonedParts(x.dueAt, tz).day}`} className={cn("text-xs hover:underline", x.overdue ? "text-[var(--health-red)]" : "text-muted-foreground")} title={t("openInCalendar")}>
          {new Date(x.dueAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short", timeZone: tz })}
        </Link>
      )}
      <Button size="sm" variant="outline" onClick={() => done.mutate(x.id)} disabled={done.isPending} aria-label={tc("markDone")}>
        <Check className="size-4" />
      </Button>
    </li>
  );
  const dealRow = (d: DealCardDto) => (
    <li key={d.id} className="flex items-center gap-2 text-sm">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: `var(--health-${d.health.toLowerCase()})` }} />
      <Link href={`${base}/crm?deal=${d.id}`} className="min-w-0 flex-1 truncate hover:underline">
        {d.title}
      </Link>
      <span className="truncate text-xs text-muted-foreground">{d.companyName}</span>
      <span className="text-xs text-muted-foreground">{d.nextStep ? `➜ ${d.nextStep}` : tc("noNextStep")}</span>
    </li>
  );

  /** The people of the plan of the day as items of the day: due today (open) and reached today (done). Late ones are the backlog, listed on their own. */
  const contactItems: CrmItem[] = data
    ? [...data.contactsDue.filter((c) => !c.overdue), ...data.contactsDone].map((c) => ({ id: `contact-${c.id}`, type: "CONTACT", subject: c.nextStep ?? "", dueAt: c.nextStepAt, overdue: false, done: c.done, contactId: c.id, contactName: c.name, companyId: null, companyName: null, dealId: null, dealTitle: null }))
    : [];
  const plan = data?.plan;
  const trackedLabel = plan ? (plan.trackedMinutes >= 60 ? t("hoursMinutes", { h: Math.floor(plan.trackedMinutes / 60), m: plan.trackedMinutes % 60 }) : t("minutesOnly", { m: plan.trackedMinutes })) : "";

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
      <OnboardingCard workspaceId={workspaceId} slug={slug} />
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
          <Stat id="tasks" active={focus === "tasks"} onPress={() => press("tasks")} value={data.tasks.overdue.length + data.tasks.today.length + data.crmTasks.length + data.contactsDue.length} label={t("statTasks")} icon={CheckSquare} tone={data.tasks.overdue.length > 0 ? "red" : undefined} />
          <Stat id="meetings" active={focus === "meetings"} onPress={() => press("meetings")} value={data.events.length + data.scheduled.length} label={t("statMeetings")} icon={CalendarClock} />
          <Stat id="attention" active={focus === "attention"} onPress={() => press("attention")} value={data.dealsNeedingNextStep.length + data.attention.staleDeals.length + data.attention.coldContacts.length} label={t("statAttention")} icon={AlertTriangle} tone="yellow" />
        </div>
      )}
      {data && focus && (
        <p className="-mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {t("showingOnly", { what: t(focus === "tasks" ? "statTasks" : focus === "meetings" ? "statMeetings" : "statAttention") })}
          <button type="button" onClick={() => setFocus(null)} className="text-primary hover:underline" data-testid="myday-show-all">
            {t("showAll")}
          </button>
        </p>
      )}
      {data && focus && (focus === "tasks" ? data.tasks.overdue.length + data.tasks.today.length + data.crmTasks.length + data.contactsDue.length : focus === "meetings" ? data.events.length + data.scheduled.length : data.dealsNeedingNextStep.length + data.attention.staleDeals.length + data.attention.coldContacts.length) === 0 && (
        <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground" data-testid="myday-focus-empty">
          {t(`focusEmpty.${focus}`)}
        </p>
      )}
      {data && data.counts.total === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-10 text-center" data-testid="myday-empty">
          <span className="text-4xl" aria-hidden>
            🦉
          </span>
          <p className="font-medium">{t("allClearTitle")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{t("allClear")}</p>
          <Button asChild variant="soft" size="sm">
            <Link href={`${base}/projects`}>{t("openProjects")}</Link>
          </Button>
        </div>
      )}
      <div id="myday-lists" className="-mb-3 scroll-mt-20" aria-hidden />
      {data && (
        <>
          {shows("tasks") && (
            <>
              <Block id="overdue" title={t("overdue")} icon={AlertTriangle} tone="red" count={data.tasks.overdue.length} href={`${base}/tasks?tab=overdue`} linkLabel={t("openTodo")}>
                <ul className="flex flex-col gap-1.5">{data.tasks.overdue.map(taskRow)}</ul>
              </Block>
              <Block id="crm-tasks" title={t("crmTasks")} icon={CheckSquare} tone="red" count={data.crmTasks.length} href={`${base}/crm/activities`} linkLabel={t("openActivities")}>
                <ul className="flex flex-col gap-2">{data.crmTasks.map(crmRow)}</ul>
              </Block>
              <ContactsDueBlock title={t("contactsDue")} hint={t("contactsDueHint")} items={data.contactsDue} base={base} locale={locale} stage={(st) => tc(`funnelStage.${st as "NEW"}`)} onDone={(id) => stepDone.mutate(id)} busy={stepDone.isPending} openLabel={t("openDayPlan")} expand={focus === "tasks"} />
              <Block id="today" title={t("today")} icon={CheckSquare} count={data.tasks.today.length} href={`${base}/tasks?tab=today`} linkLabel={t("openTodo")}>
                <ul className="flex flex-col gap-1.5">{data.tasks.today.map(taskRow)}</ul>
              </Block>
            </>
          )}
          {shows("meetings") && (
            <Block id="meetings" title={t("meetings")} icon={CalendarClock} count={data.events.length + data.scheduled.length} href={`${base}/calendar?day=${data.date}`} linkLabel={t("openCalendar")}>
              <ul className="flex flex-col gap-2">
                {data.events.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-sm">
                    <Link href={`${base}/calendar?day=${data.date}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                      {e.title}
                    </Link>
                    {e.startsAt && <span className="text-xs text-muted-foreground">{time(e.startsAt)}</span>}
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
          )}
          {shows("attention") && (
            <>
              <Block id="next-step" title={t("needNextStep")} icon={Handshake} tone="yellow" count={data.dealsNeedingNextStep.length} href={`${base}/crm`} linkLabel={t("openPipeline")}>
                <ul className="flex flex-col gap-1.5">{data.dealsNeedingNextStep.map(dealRow)}</ul>
              </Block>
              <Block id="stale" title={t("staleDeals")} icon={Clock} tone="red" count={data.attention.staleDeals.length} href={`${base}/crm`} linkLabel={t("openPipeline")}>
                <ul className="flex flex-col gap-1.5">{data.attention.staleDeals.map(dealRow)}</ul>
              </Block>
              <Block id="cold" title={t("coldContacts")} icon={UserX} tone="yellow" count={data.attention.coldContacts.length} href={`${base}/crm/contacts`} linkLabel={t("openContacts")}>
                <ul className="flex flex-col gap-1.5">
                  {data.attention.coldContacts.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 text-sm">
                      <Link href={`${base}/crm/contacts?contact=${c.id}`} className="min-w-0 flex-1 truncate hover:underline">
                        {c.name}
                      </Link>
                      <span className="truncate text-xs text-muted-foreground">{c.companyName}</span>
                      <span className="text-xs text-muted-foreground">{c.lastContactedAt ? shortDate(c.lastContactedAt, locale) : tc("neverContacted")}</span>
                    </li>
                  ))}
                </ul>
              </Block>
            </>
          )}
          {focus === null && (
            <Block id="reminders" title={t("reminders")} icon={Clock} count={data.reminders.length}>
              <ul className="flex flex-col gap-1.5 text-sm">
                {data.reminders.map((r) => (
                  <li key={r.id}>
                    {r.target?.title ?? "—"} <span className="text-xs text-muted-foreground">{shortDate(r.remindAt, locale)}</span>
                  </li>
                ))}
              </ul>
            </Block>
          )}
        </>
      )}

      {plan && (
        <section className="flex flex-col gap-3" data-testid="plan-fact" aria-labelledby="plan-fact-title">
          <h2 id="plan-fact-title" className="text-sm font-semibold">
            {t("planFactTitle")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <PlanCard title={t("planTasks")} pair={plan.tasks} href={`${base}/tasks?tab=today`} planned={t("planned")} done={t("finished")} />
            <PlanCard title={t("planMeetings")} pair={plan.meetings} href={`${base}/calendar?day=${data?.date}`} planned={t("planned")} done={t("held")} />
            {data?.crm && <CrmDayCard title={t("planFollowUps")} hint={t("crmDayHint")} items={[...data.crmDay, ...contactItems]} planned={t("planned")} done={t("finished")} base={base} tz={tz} locale={locale} onDone={(x) => (x.type === "CONTACT" ? stepDone.mutate(x.contactId as string) : done.mutate(x.id))} busy={done.isPending || stepDone.isPending} />}
          </div>
          {plan.planned === 0 && plan.backlogOpen === 0 && plan.backlogCleared === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground" data-testid="plan-fact-empty">
              {t("nothingPlanned")}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid="efficiency">
                <Ring pct={plan.efficiency} label={t("efficiency")} />
                <div>
                  <h3 className="text-sm font-semibold">{t("efficiency")}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{t("efficiencyHint", { done: plan.done, planned: plan.planned })}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid="productivity">
                <Ring pct={plan.productivity} label={t("productivity")} />
                <div>
                  <h3 className="text-sm font-semibold">{t("productivity")}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{t("productivityHint", { cleared: plan.backlogCleared, open: plan.backlogOpen })}</p>
                </div>
              </div>
            </div>
          )}
          <Link href={`${base}/time`} className="flex items-center gap-2 text-xs text-muted-foreground hover:underline" data-testid="tracked-time">
            <Timer className="size-4" aria-hidden />
            {t("tracked", { time: trackedLabel })}
          </Link>
        </section>
      )}
    </section>
  );
}
