"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FileUp, Search, UserPlus, Zap } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/ui/modal";
import { SkeletonBoard } from "@/components/ui/skeleton";
import { api } from "@/features/mindmap/api";
import { BOARD_STAGES, LIST_GOAL, SIDE_STAGES, SOURCES, TEMPERATURES, type Stage, type Temp } from "@/modules/crm/people";
import { zonedParts } from "@/modules/views/tz";
import { cn } from "@/lib/utils";
import { AddPeopleDialog } from "./AddPeopleDialog";
import { ContactDrawer } from "./ContactDrawer";
import { useMembers } from "./hooks";
import { ImportWizard } from "./ImportWizard";

export const TEMP_ICON: Record<Temp, string> = { HOT: "🔥", WARM: "🟡", COLD: "❄️" };

export interface Person {
  id: string;
  name: string;
  stage: Stage;
  temperature: Temp | null;
  source: string | null;
  interests: string[];
  influence: number | null;
  nextStep: string | null;
  nextStepAt: string | null;
  typeTag: string | null;
  country: string | null;
  ownerId: string | null;
  lastContactedAt: string | null;
  telegram: string | null;
  phone: string | null;
}
interface PeopleData {
  items: Person[];
  counts: Record<Stage, number>;
  truncated: boolean;
  totals: { all: number; shown: number; dueToday: number };
  today: string;
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/**
 * The people you are talking to, as a board: one column for each step from "new lead" to "client" or "partner", one card for each person.
 * Drag a card to the next column when something happens; the card says what to do next and when.
 */
export function PeopleBoard({ workspaceId, slug, canWrite, canExport, canErase, meId }: { workspaceId: string; slug: string; canWrite: boolean; canExport: boolean; canErase: boolean; meId: string }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const openId = search.get("contact");
  const members = useMembers(workspaceId);
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [temp, setTemp] = useState("");
  const [source, setSource] = useState("");
  const [due, setDue] = useState(false);
  const [side, setSide] = useState(false);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [over, setOver] = useState<Stage | null>(null);

  const params = new URLSearchParams({ ...(q ? { q } : {}), ...(owner ? { ownerId: owner === "me" ? meId : owner } : {}), ...(temp ? { temperature: temp } : {}), ...(source ? { source } : {}), ...(due ? { due: "1" } : {}) });
  const key = ["people", workspaceId, params.toString()];
  const { data, isLoading, isError } = useQuery({ queryKey: key, placeholderData: (p) => p, queryFn: () => api.get<PeopleData>(`/api/v1/workspaces/${workspaceId}/people?${params}`) });

  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: Stage }) => api.patch(`/api/v1/contacts/${id}`, { stage }),
    onMutate: async ({ id, stage }) => {
      await qc.cancelQueries({ queryKey: ["people", workspaceId] });
      const prev = qc.getQueriesData<PeopleData>({ queryKey: ["people", workspaceId] });
      for (const [k, v] of prev) {
        if (!v) continue;
        const was = v.items.find((i) => i.id === id)?.stage;
        if (!was || was === stage) continue;
        qc.setQueryData<PeopleData>(k, { ...v, items: v.items.map((i) => (i.id === id ? { ...i, stage } : i)), counts: { ...v.counts, [was]: v.counts[was] - 1, [stage]: v.counts[stage] + 1 } });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev.forEach(([k, v]) => qc.setQueryData(k, v)),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["people", workspaceId] });
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(search.toString());
    if (id) next.set("contact", id);
    else next.delete("contact");
    router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const byStage = (s: Stage) => (data?.items ?? []).filter((i) => i.stage === s);
  const total = data?.totals.all ?? 0;
  const goalPct = Math.min(100, Math.round((total / LIST_GOAL) * 100));
  const stageLabel = (s: Stage) => t(`funnelStage.${s}`);

  const dueLabel = (iso: string) => {
    const day = zonedParts(iso, "UTC").day; // a next step is a date: it stays on its own day
    const today = data?.today ?? "";
    const text = new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
    return { text, late: !!today && day < today, today: day === today };
  };

  const card = (p: Person) => {
    const next = p.nextStepAt ? dueLabel(p.nextStepAt) : null;
    return (
      <li
        key={p.id}
        draggable={canWrite}
        onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)}
        data-testid="person-card"
        data-person={p.id}
        className={cn("flex cursor-pointer flex-col gap-1.5 rounded-xl border bg-card p-2.5 text-sm shadow-sm hover:border-primary/50", openId === p.id ? "border-primary ring-1 ring-primary" : "border-border")}
        onClick={() => setOpen(p.id)}
      >
        <div className="flex items-start gap-1.5">
          <span className="min-w-0 flex-1 font-medium leading-snug">{p.name}</span>
          {p.temperature && (
            <span title={t(`temp.${p.temperature}`)} aria-label={t(`temp.${p.temperature}`)}>
              {TEMP_ICON[p.temperature]}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          {p.typeTag && <span className="rounded bg-accent px-1.5 py-0.5 font-semibold text-accent-foreground">{p.typeTag}</span>}
          {p.country && <span>{p.country}</span>}
          {p.source && <span className="rounded bg-muted px-1.5 py-0.5">{p.source}</span>}
          {p.influence !== null && (
            <span className="inline-flex items-center gap-0.5" title={t("field.influence")}>
              <Zap className="size-3" aria-hidden />
              {p.influence}
            </span>
          )}
        </div>
        {(p.nextStep || next) && (
          <div className={cn("flex items-center gap-1 rounded-md px-1.5 py-1 text-xs", next?.late ? "bg-[var(--health-red)]/12 text-[var(--health-red)]" : next?.today ? "bg-[var(--health-yellow)]/15" : "bg-muted/60 text-muted-foreground")}>
            <CalendarClock className="size-3 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{p.nextStep ?? t("nextStepNone")}</span>
            {next && <span className="shrink-0 tabular-nums">{next.text}</span>}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          {canWrite && (
            <select
              aria-label={t("field.stage")}
              className="h-6 min-w-0 flex-1 rounded border border-transparent bg-transparent px-0.5 text-[11px] text-muted-foreground hover:border-border"
              value={p.stage}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => move.mutate({ id: p.id, stage: e.target.value as Stage })}
            >
              {[...BOARD_STAGES, ...SIDE_STAGES].map((s) => (
                <option key={s} value={s}>
                  {stageLabel(s)}
                </option>
              ))}
            </select>
          )}
          {p.ownerId && p.ownerId !== meId && <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[9px] font-semibold text-primary" title={members.data?.find((m) => m.id === p.ownerId)?.name ?? ""}>{initials(members.data?.find((m) => m.id === p.ownerId)?.name ?? "?")}</span>}
        </div>
      </li>
    );
  };

  const column = (s: Stage) => (
    <section
      key={s}
      aria-label={stageLabel(s)}
      data-testid={`stage-${s}`}
      onDragOver={(e) => {
        if (!canWrite) return;
        e.preventDefault();
        setOver(s);
      }}
      onDragLeave={() => setOver((c) => (c === s ? null : c))}
      onDrop={(e) => {
        e.preventDefault();
        setOver(null);
        const id = e.dataTransfer.getData("text/plain");
        if (id && canWrite) move.mutate({ id, stage: s });
      }}
      className={cn("flex w-64 shrink-0 flex-col rounded-2xl border border-border bg-muted/40", over === s && "border-primary bg-primary/10")}
    >
      <h3 className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {stageLabel(s)}
        <span className="rounded-full bg-background px-1.5 py-0.5 text-[11px] tabular-nums" data-testid="stage-count">
          {data?.counts[s] ?? 0}
        </span>
      </h3>
      <ul className="flex min-h-16 flex-col gap-2 overflow-y-auto px-2 pb-2">{byStage(s).map(card)}</ul>
    </section>
  );

  return (
    <div className="flex h-full flex-col gap-3 p-4" data-testid="people-board">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold">{t("peopleTitle")}</h1>
        <div className="flex min-w-48 flex-col gap-1" data-testid="list-goal">
          <span className="text-xs text-muted-foreground">{t("listCounter", { n: total, goal: LIST_GOAL })}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className="block h-full rounded-full bg-primary" style={{ width: `${goalPct}%` }} />
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canWrite && (
            <>
              <Button variant="outline" size="sm" onClick={() => setImporting(true)}>
                <FileUp className="size-4" />
                {t("importCsv")}
              </Button>
              <Button size="sm" onClick={() => setAdding(true)} data-testid="add-people">
                <UserPlus className="size-4" />
                {t("addList")}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <Input aria-label={t("search")} placeholder={t("search")} value={q} onChange={(e) => setQ(e.target.value)} className="w-52 pl-8" />
        </div>
        <select aria-label={t("owner")} className={cn(selectClass, "w-auto")} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">{t("allOwners")}</option>
          <option value="me">{t("mine")}</option>
          {members.data?.filter((m) => m.id !== meId).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.email}
            </option>
          ))}
        </select>
        <select aria-label={t("field.temperature")} className={cn(selectClass, "w-auto")} value={temp} onChange={(e) => setTemp(e.target.value)}>
          <option value="">{t("anyWarmth")}</option>
          {TEMPERATURES.map((x) => (
            <option key={x} value={x}>
              {TEMP_ICON[x]} {t(`temp.${x}`)}
            </option>
          ))}
        </select>
        <select aria-label={t("field.source")} className={cn(selectClass, "w-auto")} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">{t("anySource")}</option>
          {SOURCES.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={due}
          onClick={() => setDue((d) => !d)}
          data-testid="filter-due"
          className={cn("inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm", due ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground hover:bg-muted")}
        >
          <CalendarClock className="size-4" />
          {t("dueToday")}
          <span className="rounded-full bg-background px-1.5 text-xs tabular-nums">{data?.totals.dueToday ?? 0}</span>
        </button>
        <button type="button" aria-pressed={side} onClick={() => setSide((s) => !s)} className={cn("ml-auto h-9 rounded-md border px-3 text-sm", side ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground hover:bg-muted")}>
          {t("sideStages")} ({(data?.counts.DECLINED ?? 0) + (data?.counts.NO_REPLY ?? 0)})
        </button>
      </div>

      {isLoading && <SkeletonBoard columns={5} />}
      {isError && (
        <p role="alert" className="text-sm text-danger">
          {t("error")}
        </p>
      )}
      {data?.truncated && <p className="text-xs text-[var(--health-yellow)]">{t("peopleTruncated")}</p>}
      {data && data.totals.all === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-10 text-center" data-testid="people-empty">
          <span className="text-4xl" aria-hidden>
            🦉
          </span>
          <p className="font-medium">{t("peopleEmptyTitle")}</p>
          <p className="max-w-md text-sm text-muted-foreground">{t("peopleEmpty", { goal: LIST_GOAL })}</p>
          {canWrite && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <UserPlus className="size-4" />
              {t("addList")}
            </Button>
          )}
        </div>
      )}
      {data && data.totals.all > 0 && (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
          {BOARD_STAGES.map(column)}
          {side && SIDE_STAGES.map(column)}
        </div>
      )}

      {openId && <ContactDrawer key={openId} workspaceId={workspaceId} slug={slug} contactId={openId} canWrite={canWrite} canErase={canErase} canExport={canExport} meId={meId} onClose={() => setOpen(null)} />}
      <AddPeopleDialog open={adding} onClose={() => setAdding(false)} workspaceId={workspaceId} meId={meId} onAdded={() => void qc.invalidateQueries({ queryKey: ["people", workspaceId] })} />
      <ImportWizard open={importing} onClose={() => (setImporting(false), void qc.invalidateQueries({ queryKey: ["people", workspaceId] }))} workspaceId={workspaceId} entity="contacts" />
    </div>
  );
}
