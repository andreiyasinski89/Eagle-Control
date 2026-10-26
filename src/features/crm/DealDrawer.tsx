"use client";

import { AiLeadReply } from "@/features/ai/ai";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarPlus, FolderPlus, Mail, MessageSquare, Phone, StickyNote, Trophy, X, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/ui/modal";
import { Link } from "@/i18n/navigation";
import { Attachments } from "@/features/drawer/Attachments";
import { Comments } from "@/features/drawer/Comments";
import type { NodeDetail } from "@/features/drawer/types";
import { api, ApiFailure } from "@/features/mindmap/api";
import { useMapStore } from "@/features/mindmap/store";
import { cn } from "@/lib/utils";
import { ActivityDialog } from "./DealDialogs";
import { dayInput, dayToIso, money, shortDate } from "./format";
import { useCompanyOptions, useContactOptions, useMembers } from "./hooks";
import { NodeTags } from "./NodeTags";
import type { ActivityDto, DealDetailDto } from "./types";
import { SkeletonRows } from "@/components/ui/skeleton";

const ACTIVITY_ICON = { CALL: Phone, EMAIL: Mail, MEETING: CalendarPlus, NOTE: StickyNote, MESSAGE: MessageSquare, TASK: StickyNote } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border px-4 py-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

interface Props {
  workspaceId: string;
  slug: string;
  dealId: string;
  canWrite: boolean;
  meId: string;
  onClose: () => void;
  /** The parent owns the win / lose dialogs because the board uses them for drag & drop too. */
  onWin: (deal: { id: string; title: string }) => void;
  onLose: (dealId: string) => void;
  onCreateProject: (deal: { id: string; title: string }) => void;
}

export function DealDrawer({ workspaceId, slug, dealId, canWrite, meId, onClose, onWin, onLose, onCreateProject }: Props) {
  const t = useTranslations("crm");
  const tm = useTranslations("map");
  const locale = useLocale();
  const qc = useQueryClient();
  const members = useMembers(workspaceId);
  // The comment composer reads @mention candidates from the shared store; seed it with the workspace members.
  useEffect(() => {
    if (!members.data) return;
    const people = Object.fromEntries(members.data.map((m) => [m.id, { id: m.id, name: m.name, email: m.email, avatar: null, image: null }]));
    useMapStore.setState({ people, meId, workspaceId });
  }, [members.data, meId, workspaceId]);
  const [activity, setActivity] = useState<{ type?: ActivityDto["type"]; schedule?: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: deal, isError } = useQuery({ queryKey: ["deal", dealId], queryFn: () => api.get<DealDetailDto>(`/api/v1/deals/${dealId}`) });
  const { data: node } = useQuery({ queryKey: ["node", dealId], queryFn: () => api.get<NodeDetail>(`/api/v1/nodes/${dealId}`) });
  const companies = useCompanyOptions(workspaceId);
  const contacts = useContactOptions(workspaceId, deal?.companyId);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["deal", dealId] });
    void qc.invalidateQueries({ queryKey: ["node", dealId] });
    void qc.invalidateQueries({ queryKey: ["board"] });
  };
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/v1/deals/${dealId}`, body),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("error")),
  });
  const move = useMutation({
    mutationFn: (stageId: string) => api.post(`/api/v1/deals/${dealId}/move`, { stageId }),
    onSuccess: refresh,
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("error")),
  });
  const reopen = useMutation({ mutationFn: () => api.post(`/api/v1/deals/${dealId}/reopen`, {}), onSuccess: refresh });

  if (isError) {
    return (
      <aside className="z-40 w-[440px] shrink-0 border-l border-border bg-card p-4 text-sm text-muted-foreground max-md:fixed max-md:inset-0 max-md:w-full">
        {t("dealGone")}
        <Button variant="ghost" size="sm" onClick={onClose} className="ml-2">
          <X className="size-4" />
        </Button>
      </aside>
    );
  }
  if (!deal) return <aside className="z-40 w-[440px] shrink-0 border-l border-border bg-card p-4 max-md:fixed max-md:inset-0 max-md:w-full"><SkeletonRows rows={6} /></aside>;

  const dis = !canWrite;
  const stage = deal.stages.find((s) => s.id === deal.stageId);

  return (
    <aside data-testid="deal-drawer" className="z-40 flex w-[440px] shrink-0 flex-col overflow-y-auto border-l border-border bg-card max-md:fixed max-md:inset-0 max-md:w-full">
      <header className="flex items-start gap-2 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">{deal.companyName ?? t("noCompany")}</div>
          <Input
            key={deal.title}
            aria-label={t("dealTitle")}
            disabled={dis}
            defaultValue={deal.title}
            className="mt-1 h-auto border-transparent bg-transparent px-1 py-1 text-lg font-semibold hover:border-border"
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== deal.title && patch.mutate({ title: e.target.value.trim() })}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={t("close")}>
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex items-center gap-2 px-4 pb-2 text-sm">
        <span className="size-3 rounded-full" style={{ background: `var(--health-${deal.health.toLowerCase()})` }} role="img" aria-label={tm(`health.${deal.health}`)} />
        <span className="font-medium">{money(deal.amount, deal.currency, locale)}</span>
        <span className="text-muted-foreground">· {deal.probability}%</span>
        {deal.status === "won" && <span className="rounded bg-[var(--health-green)]/15 px-1.5 text-xs text-[var(--health-green)]">{t("won")}</span>}
        {deal.status === "lost" && <span className="rounded bg-[var(--health-red)]/15 px-1.5 text-xs text-[var(--health-red)]">{t("lost")}{deal.lostReason ? `: ${deal.lostReason}` : ""}</span>}
        <span className="ml-auto text-xs text-muted-foreground">{t("daysInStage", { count: deal.daysInStage })}</span>
      </div>

      {deal.status === "open" && !deal.nextStep && (
        <div role="alert" className="mx-4 mb-2 flex items-center gap-2 rounded-md bg-[var(--health-yellow)]/15 px-3 py-2 text-sm">
          <AlertTriangle className="size-4 text-[var(--health-yellow)]" />
          {t("noNextStepWarning")}
        </div>
      )}
      {error && (
        <p role="alert" className="mx-4 mb-2 text-sm text-danger">
          {error}
        </p>
      )}

      {canWrite && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          <Button size="sm" variant="outline" onClick={() => setActivity({ type: "CALL" })}>
            <Phone className="size-4" />
            {t("logCall")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setActivity({ type: "EMAIL" })}>
            <Mail className="size-4" />
            {t("logEmail")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setActivity({ schedule: true })}>
            <CalendarPlus className="size-4" />
            {t("scheduleMeeting")}
          </Button>
          {canWrite && <AiLeadReply dealId={deal.id} workspaceId={workspaceId} />}
          <Button size="sm" variant="outline" onClick={() => setActivity({ type: "NOTE" })}>
            <StickyNote className="size-4" />
            {t("addNote")}
          </Button>
          {deal.status === "open" && (
            <>
              <Button size="sm" onClick={() => onWin({ id: deal.id, title: deal.title })}>
                <Trophy className="size-4" />
                {t("markWon")}
              </Button>
              <Button size="sm" variant="danger" onClick={() => onLose(deal.id)}>
                <XCircle className="size-4" />
                {t("markLost")}
              </Button>
            </>
          )}
          {deal.status !== "open" && (
            <Button size="sm" variant="outline" onClick={() => reopen.mutate()}>
              {t("reopen")}
            </Button>
          )}
          {deal.status !== "lost" && (
            <Button size="sm" variant="outline" onClick={() => onCreateProject({ id: deal.id, title: deal.title })}>
              <FolderPlus className="size-4" />
              {t("createProject")}
            </Button>
          )}
        </div>
      )}

      <Section title={t("details")}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("stage")}>
            <select
              className={selectClass}
              disabled={dis}
              value={deal.stageId}
              onChange={(e) => {
                const s = deal.stages.find((x) => x.id === e.target.value);
                if (s?.isLost) onLose(deal.id);
                else if (s?.isWon) onWin({ id: deal.id, title: deal.title });
                else move.mutate(e.target.value);
              }}
            >
              {deal.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("owner")}>
            <select className={selectClass} disabled={dis} value={deal.ownerId ?? ""} onChange={(e) => patch.mutate({ ownerId: e.target.value || null })}>
              <option value="">—</option>
              {members.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("amount")}>
            <Input type="number" min={0} step="0.01" disabled={dis} defaultValue={deal.amount} key={`a${deal.amount}`} onBlur={(e) => Number(e.target.value) !== deal.amount && patch.mutate({ amount: Number(e.target.value) || 0 })} />
          </Field>
          <Field label={t("currency")}>
            <Input maxLength={3} disabled={dis} defaultValue={deal.currency} key={`c${deal.currency}`} onBlur={(e) => e.target.value.toUpperCase() !== deal.currency && e.target.value.length === 3 && patch.mutate({ currency: e.target.value.toUpperCase() })} />
          </Field>
          <Field label={`${t("probability")} (${stage?.probability ?? 0}% ${t("byStage")})`}>
            <Input
              type="number"
              min={0}
              max={100}
              disabled={dis || deal.status !== "open"}
              placeholder={String(stage?.probability ?? 0)}
              defaultValue={deal.manualProbability ?? ""}
              key={`p${deal.manualProbability}`}
              onBlur={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                if (v !== deal.manualProbability) patch.mutate({ probability: v });
              }}
            />
          </Field>
          <Field label={t("expectedClose")}>
            <Input type="date" disabled={dis} value={dayInput(deal.expectedCloseDate)} onChange={(e) => patch.mutate({ expectedCloseDate: dayToIso(e.target.value) })} />
          </Field>
          <Field label={t("company")}>
            <select className={selectClass} disabled={dis} value={deal.companyId ?? ""} onChange={(e) => patch.mutate({ companyId: e.target.value || null, primaryContactId: null })}>
              <option value="">—</option>
              {companies.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legalName}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("contact")}>
            <select className={selectClass} disabled={dis} value={deal.contactId ?? ""} onChange={(e) => patch.mutate({ primaryContactId: e.target.value || null })}>
              <option value="">—</option>
              {contacts.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("source")}>
            <Input disabled={dis} maxLength={80} defaultValue={deal.source ?? ""} key={`s${deal.source}`} onBlur={(e) => e.target.value !== (deal.source ?? "") && patch.mutate({ source: e.target.value })} />
          </Field>
        </div>
        <div className={cn("grid grid-cols-[1fr_150px] gap-3 rounded-md p-2", deal.status === "open" && !deal.nextStep && "bg-[var(--health-yellow)]/10")}>
          <Field label={t("nextStep")}>
            <Input disabled={dis} maxLength={300} defaultValue={deal.nextStep ?? ""} key={`n${deal.nextStep}`} placeholder={t("nextStepHint")} onBlur={(e) => e.target.value !== (deal.nextStep ?? "") && patch.mutate({ nextStep: e.target.value })} />
          </Field>
          <Field label={t("nextStepDate")}>
            <Input type="date" disabled={dis} value={dayInput(deal.nextStepAt)} onChange={(e) => patch.mutate({ nextStepAt: dayToIso(e.target.value) })} />
          </Field>
        </div>
      </Section>

      <Section title={t("projects")}>
        {deal.projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noProjects")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {deal.projects.map((p) => (
              <li key={p.id}>
                <Link href={`/w/${slug}/projects/p/${p.id}`} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm hover:border-primary" style={{ borderLeft: `4px solid var(--health-${p.health.toLowerCase()})` }}>
                  <span className="min-w-0 flex-1 truncate">{p.title}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{p.progress}%</span>
                  {p.dueDate && <span className="text-xs text-muted-foreground">{shortDate(p.dueDate, locale)}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t("tags")}>
        <NodeTags nodeId={dealId} workspaceId={workspaceId} current={deal.tags} canWrite={canWrite} onChange={refresh} />
      </Section>

      <Section title={t("activityFeed")}>
        {deal.activities.length === 0 && <p className="text-sm text-muted-foreground">{t("noActivities")}</p>}
        <ul className="flex flex-col gap-3">
          {deal.activities.map((a) => {
            const Icon = ACTIVITY_ICON[a.type];
            const open = !a.completedAt;
            return (
              <li key={a.id} className="flex gap-2 text-sm">
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{a.subject}</div>
                  {a.body && <div className="whitespace-pre-wrap text-muted-foreground">{a.body}</div>}
                  <div className="text-xs text-muted-foreground">
                    {a.owner.name ?? a.owner.email} · {new Date(a.completedAt ?? a.dueAt ?? a.createdAt).toLocaleString(locale)}
                    {open && a.dueAt && <span className="ml-1 rounded bg-muted px-1">{t("scheduled")}</span>}
                  </div>
                </div>
                {open && canWrite && (
                  <button
                    className="self-start text-xs text-primary hover:underline"
                    onClick={async () => {
                      await api.patch(`/api/v1/activities/${a.id}`, { completed: true });
                      refresh();
                    }}
                  >
                    {t("markDone")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={t("comments")}>
        <Comments nodeId={dealId} meId={meId} canComment />
      </Section>
      <Section title={t("files")}>
        <Attachments nodeId={dealId} items={node?.attachments ?? []} canWrite={canWrite} onChange={refresh} />
      </Section>

      <ActivityDialog
        open={activity !== null}
        onClose={() => setActivity(null)}
        workspaceId={workspaceId}
        defaults={{ type: activity?.type, schedule: activity?.schedule, dealId, contactId: deal.contactId, companyId: deal.companyId }}
        onSaved={refresh}
      />
    </aside>
  );
}

