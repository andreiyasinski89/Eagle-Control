"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CalendarPlus, Check, ChevronDown, ChevronRight, Download, Mail, MessageSquareReply, Mic, Phone, Plus, ShieldAlert, StickyNote, Trash2, Users, X } from "lucide-react";
import { DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { MeetingDialog } from "./TouchQueue";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, Modal, selectClass, textareaClass } from "@/components/ui/modal";
import { Link } from "@/i18n/navigation";
import { Attachments } from "@/features/drawer/Attachments";
import { VoiceNote } from "./VoiceNote";
import { ScriptBlock } from "./ScriptBlock";
import { buildMessengerLink } from "@/modules/crm/messenger";
import { Comments } from "@/features/drawer/Comments";
import type { NodeDetail } from "@/features/drawer/types";
import { api, ApiFailure } from "@/features/mindmap/api";
import { SharePanel } from "./SharePanel";
import { useMapStore } from "@/features/mindmap/store";
import { useTimeZone } from "@/features/views/useTimeZone";
import { ActivityDialog } from "./DealDialogs";
import { FunnelFields, type FunnelValues } from "./FunnelFields";
import { PartnerFields, type TransferRow } from "./PartnerFields";
import { ScheduleDialog } from "./ScheduleDialog";
import { dayInput, dayToIso, money } from "./format";
import { useCompanyOptions, useMembers } from "./hooks";
import { NodeTags } from "./NodeTags";
import { ActivityRow } from "./ActivityDetail";
import type { ActivityDto, Paged } from "./types";
import { SkeletonRows } from "@/components/ui/skeleton";
import { zonedParts } from "@/modules/views/tz";

export interface ContactDetail {
  id: string;
  name: string;
  access: { canEdit: boolean; canShare: boolean };
  firstName: string;
  lastName: string | null;
  position: string | null;
  emails: string[];
  phones: string[];
  messengers: Record<string, string>;
  companyId: string | null;
  companyName: string | null;
  ownerId: string | null;
  birthday: string | null;
  consentGiven: boolean;
  consentAt: string | null;
  lastContactedAt: string | null;
  repliedAt: string | null;
  stage: FunnelValues["stage"];
  declineReason: string | null;
  temperature: FunnelValues["temperature"];
  temperatureManualUntil?: string | null;
  interests: string[];
  source: string | null;
  influence: number | null;
  nextStep: string | null;
  nextStepAt: string | null;
  typeTag: string | null;
  country: string | null;
  city?: string | null;
  sponsorName: string | null;
  groupId: string | null;
  sponsorId: string | null;
  heldById: string | null;
  linkedUserId: string | null;
  transfers: TransferRow[];
  tags: { id: string; name: string; color: string }[];
  consentHistory: { id: string; purpose: string; givenAt: string; source: string | null; revokedAt: string | null }[];
  deals: { id: string; title: string; stage: string; amount: number; currency: string }[];
}

/** The link behind the "Open" next to a messenger field: the person's own chat or page, from what is typed there. */
export const messengerLinks: Record<string, (v: string) => string> = Object.fromEntries(
  (["telegram", "whatsapp", "instagram"] as const).map((m) => [m, (v: string) => buildMessengerLink(m, { phones: [], messengers: { [m]: v } }, "").url]),
);

/** A part of the card below the actions. Folded unless it is asked to start open: the card stays short, one press opens a part. */
function Section({ title, children, open = false, count }: { title: string; children: React.ReactNode; open?: boolean; count?: number }) {
  return (
    <details open={open} className="group border-t border-border px-4 py-2" data-testid="card-section">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
        {title}
        {count !== undefined && count > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] normal-case tabular-nums">{count}</span>}
      </summary>
      <div className="flex flex-col gap-2 pb-2 pt-1">{children}</div>
    </details>
  );
}

const list = (v: string) => v.split(/[;,\n]+/).map((x) => x.trim()).filter(Boolean);

export function ContactDrawer({ workspaceId, slug, contactId, canWrite, canErase, canExport, meId, onClose }: { workspaceId: string; slug: string; contactId: string; canWrite: boolean; canErase: boolean; canExport: boolean; meId: string; onClose: () => void }) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const tm = useTranslations("messenger");
  const locale = useLocale();
  const qc = useQueryClient();
  const members = useMembers(workspaceId);
  const companies = useCompanyOptions(workspaceId);
  const [activity, setActivity] = useState<ActivityDto["type"] | null>(null);
  const [planning, setPlanning] = useState(false);
  const [voice, setVoice] = useState(false);
  const [meeting, setMeeting] = useState(false);
  const { tz } = useTimeZone();
  const [erasing, setErasing] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!members.data) return;
    useMapStore.setState({ people: Object.fromEntries(members.data.map((m) => [m.id, { id: m.id, name: m.name, email: m.email, avatar: null, image: null }])), meId, workspaceId });
  }, [members.data, meId, workspaceId]);

  const { data: c, isError } = useQuery({ queryKey: ["contact", contactId], queryFn: () => api.get<ContactDetail>(`/api/v1/contacts/${contactId}`) });
  const { data: node } = useQuery({ queryKey: ["node", contactId], queryFn: () => api.get<NodeDetail>(`/api/v1/nodes/${contactId}`) });
  // The feed starts with the 30 latest records; "show more" adds 30 at a time (up to 200), so nothing older silently disappears.
  const [feedSize, setFeedSize] = useState(30);
  const feed = useQuery({ queryKey: ["activities", "contact", contactId, feedSize], placeholderData: (p) => p, queryFn: () => api.get<Paged<ActivityDto & { dealTitle: string | null }>>(`/api/v1/workspaces/${workspaceId}/activities?contactId=${contactId}&pageSize=${feedSize}`) });

  // Planned calls and meetings: open activities with a date, soonest first.
  const planned = useQuery({ queryKey: ["activities", "contact", contactId, "planned"], queryFn: () => api.get<Paged<ActivityDto>>(`/api/v1/workspaces/${workspaceId}/activities?contactId=${contactId}&status=open&pageSize=50`) });
  const upcoming = (planned.data?.items ?? []).filter((a) => a.dueAt).sort((a, b) => (a.dueAt as string).localeCompare(b.dueAt as string));
  const when = (a: ActivityDto) => {
    const start = new Date(a.dueAt as string);
    const day = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone: tz }).format(start);
    const hm = (d: Date) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d);
    const end = a.durationMin ? new Date(start.getTime() + a.durationMin * 60_000) : null;
    return `${day}, ${hm(start)}${end && zonedParts(end, tz).day === zonedParts(start, tz).day ? `–${hm(end)}` : ""}`;
  };

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["contact", contactId] });
    void qc.invalidateQueries({ queryKey: ["node", contactId] });
    void qc.invalidateQueries({ queryKey: ["activities", "contact", contactId] });
    void qc.invalidateQueries({ queryKey: ["contacts"] });
    void qc.invalidateQueries({ queryKey: ["people"] });
    void qc.invalidateQueries({ queryKey: ["partners"] });
    void qc.invalidateQueries({ queryKey: ["groups"] });
    void qc.invalidateQueries({ queryKey: ["calendar"] });
    void qc.invalidateQueries({ queryKey: ["my-day"] });
  };
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/v1/contacts/${contactId}`, body),
    // The press shows at once (warmth, priority, stage...) and is put back if the save fails; the server's answer then confirms it.
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ["contact", contactId] });
      const prev = qc.getQueryData<ContactDetail>(["contact", contactId]);
      if (prev) qc.setQueryData<ContactDetail>(["contact", contactId], { ...prev, ...body });
      return { prev };
    },
    onSuccess: () => (setError(null), refresh()),
    onError: (e, _body, ctx) => {
      if (ctx?.prev) qc.setQueryData(["contact", contactId], ctx.prev);
      setError(e instanceof ApiFailure ? e.message : t("error"));
    },
  });
  const finish = useMutation({ mutationFn: (id: string) => api.patch(`/api/v1/activities/${id}`, { completed: true }), onSuccess: refresh });
  const unplan = useMutation({ mutationFn: (id: string) => api.del(`/api/v1/activities/${id}`), onSuccess: refresh });
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyAt, setReplyAt] = useState("");
  const localNow = () => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };
  const replied = useMutation({
    mutationFn: () => api.post(`/api/v1/contacts/${contactId}/replied`, { subject: t("replySubject"), ...(replyText.trim() ? { text: replyText.trim() } : {}), ...(replyAt ? { at: new Date(replyAt).toISOString() } : {}) }),
    onSuccess: () => {
      setReplying(false);
      setReplyText("");
      refresh();
    },
  });
  // "Meeting" in the card is the same result as in the touch queue: the meeting in the calendar, the touch in the feed, the stage moved on.
  const meetingSet = useMutation({
    mutationFn: (meetingAt: string) => api.post(`/api/v1/contacts/${contactId}/touch`, { outcome: "MEETING_SET", meetingAt, locale }),
    onSuccess: () => (setMeeting(false), setError(null), refresh()),
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("error")),
  });
  const consent = useMutation({ mutationFn: (given: boolean) => api.put(`/api/v1/contacts/${contactId}/consent`, { given, source: "manual" }), onSuccess: refresh });

  async function exportData() {
    const res = await fetch(`/api/v1/contacts/${contactId}/gdpr-export`);
    if (!res.ok) return setError(t("error"));
    const url = URL.createObjectURL(new Blob([JSON.stringify(await res.json(), null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `contact-${contactId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const erase = useMutation({
    mutationFn: () => api.post(`/api/v1/contacts/${contactId}/gdpr-erase`, { confirm }),
    onSuccess: () => {
      setErasing(false);
      onClose();
      void qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("error")),
  });

  const shell = "z-40 w-[440px] shrink-0 overflow-y-auto border-l border-border bg-card max-md:fixed max-md:inset-0 max-md:w-full";
  if (isError) return <aside className={`${shell} p-4 text-sm text-muted-foreground`}>{t("contactGone")}</aside>;
  if (!c) return <aside className={`${shell} p-4`}><SkeletonRows rows={5} /></aside>;
  const dis = !canWrite || !c.access.canEdit;
  const awaitingAnswer = !!c.repliedAt && (!c.lastContactedAt || new Date(c.lastContactedAt) < new Date(c.repliedAt));
  const cold = !c.lastContactedAt || Date.now() - new Date(c.lastContactedAt).getTime() > 30 * 86_400_000;

  return (
    <aside data-testid="contact-drawer" className={`${shell} flex flex-col`}>
      <header className="flex items-start gap-2 p-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">
            {t(`funnelStage.${c.stage}`)} ·{" "}
            {c.companyId ? (
              <Link href={`/w/${slug}/crm/companies/${c.companyId}`} className="hover:underline">
                {c.companyName}
              </Link>
            ) : (
              t("noCompany")
            )}
          </div>
          <h2 className="mt-1 text-lg font-semibold">{c.name}</h2>
          {awaitingAnswer ? (
            <p className="mt-1 w-fit rounded-full bg-[var(--health-yellow)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--health-yellow)]" data-testid="card-status">
              {t("awaitingSince", { date: new Date(c.repliedAt!).toLocaleDateString(locale, { day: "numeric", month: "short" }) })}
              {c.lastContactedAt ? ` · ${t("ourLastTouch", { date: new Date(c.lastContactedAt).toLocaleDateString(locale, { day: "numeric", month: "short" }) })}` : ""}
            </p>
          ) : (
            <p className={cn("text-xs", cold ? "text-[var(--health-yellow)]" : "text-muted-foreground")} data-testid="card-status">
              {c.repliedAt && c.lastContactedAt
                ? t("replyAndTouch", { reply: new Date(c.repliedAt).toLocaleDateString(locale), touch: new Date(c.lastContactedAt).toLocaleDateString(locale) })
                : c.lastContactedAt
                  ? t("lastContact", { date: new Date(c.lastContactedAt).toLocaleDateString(locale) })
                  : t("neverContacted")}
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={t("close")}>
          <X className="size-4" />
        </Button>
      </header>
      {error && (
        <p role="alert" className="mx-4 mb-2 text-sm text-danger">
          {error}
        </p>
      )}

      {canWrite && (
        <div className="flex flex-col gap-2 px-4 pb-3" data-testid="card-actions">
          <ScriptBlock key={c.id} compact workspaceId={workspaceId} meId={meId} stage={c.stage} canWrite={canWrite} person={{ id: c.id, name: c.name, phones: c.phones, messengers: c.messengers }} onSent={refresh} />
          <div className="grid grid-cols-3 gap-2">
            <Button size="sm" variant="outline" className="min-h-11 gap-1.5 px-2 md:min-h-9" disabled={dis || replied.isPending} onClick={() => (setReplyAt(localNow()), setReplying(true))} data-testid="mark-replied">
              <MessageSquareReply className="size-4 shrink-0" />
              <span className="truncate">{t("actReplied")}</span>
            </Button>
            <Button size="sm" variant="outline" className="min-h-11 gap-1.5 px-2 md:min-h-9" disabled={dis || meetingSet.isPending} onClick={() => setMeeting(true)} data-testid="card-meeting">
              <CalendarPlus className="size-4 shrink-0" />
              <span className="truncate">{t("actMeeting")}</span>
            </Button>
            <DropdownMenu>
              <DropdownTrigger asChild>
                <Button size="sm" variant="outline" className="min-h-11 gap-1 px-2 md:min-h-9" data-testid="card-record">
                  <Plus className="size-4 shrink-0" />
                  <span className="truncate">{t("actRecord")}</span>
                  <ChevronDown className="size-3.5 shrink-0" />
                </Button>
              </DropdownTrigger>
              <DropdownContent align="end">
                <DropdownItem onSelect={() => setActivity("CALL")} data-testid="record-call">
                  <Phone className="size-4" />
                  {t("recCall")}
                </DropdownItem>
                <DropdownItem onSelect={() => setActivity("EMAIL")}>
                  <Mail className="size-4" />
                  {t("recEmail")}
                </DropdownItem>
                <DropdownItem onSelect={() => setActivity("NOTE")} data-testid="record-note">
                  <StickyNote className="size-4" />
                  {t("recNote")}
                </DropdownItem>
                <DropdownItem onSelect={() => setVoice(true)} data-testid="record-voice">
                  <Mic className="size-4" />
                  {t("recVoice")}
                </DropdownItem>
                <DropdownItem onSelect={() => setPlanning(true)} data-testid="plan-contact">
                  <CalendarClock className="size-4" />
                  {t("recPlan")}
                </DropdownItem>
              </DropdownContent>
            </DropdownMenu>
          </div>
          <VoiceNote workspaceId={workspaceId} contactId={contactId} companyId={c.companyId} onSaved={refresh} open={voice} onOpenChange={setVoice} />
          {meeting && <MeetingDialog tz={tz} busy={meetingSet.isPending} onClose={() => setMeeting(false)} onSave={(iso) => meetingSet.mutate(iso)} />}
        </div>
      )}

      <Section title={t("partnerSection")}>
        <PartnerFields workspaceId={workspaceId} meId={meId} contactId={contactId} stage={c.stage} sponsorId={c.sponsorId} heldById={c.heldById} linkedUserId={c.linkedUserId} transfers={c.transfers} disabled={dis} onPatch={(body) => patch.mutate(body)} />
      </Section>

      <Section title={t("funnel")}>
        <FunnelFields
          temperatureManualUntil={c.temperatureManualUntil ?? null}
          disabled={dis}
          workspaceId={workspaceId}
          value={{ stage: c.stage, declineReason: c.declineReason, temperature: c.temperature, interests: c.interests, source: c.source, influence: c.influence, nextStep: c.nextStep, nextStepAt: c.nextStepAt, typeTag: c.typeTag, country: c.country, city: c.city ?? null, sponsorName: c.sponsorName, groupId: c.groupId }}
          onChange={(patchBody) => patch.mutate(patchBody)}
        />
      </Section>

      {(upcoming.length > 0 || canWrite) && (
        <Section title={t("planUpcoming")} open={upcoming.length > 0} count={upcoming.length}>
          {upcoming.length === 0 && <p className="text-sm text-muted-foreground">{t("planNone")}</p>}
          <ul className="flex flex-col gap-2 text-sm" data-testid="planned-list">
            {upcoming.map((a) => (
              <li key={a.id} className="flex items-start gap-2">
                {a.type === "MEETING" ? <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> : <Phone className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{a.subject}</span>
                  <Link href={`/w/${slug}/calendar?day=${zonedParts(a.dueAt as string, tz).day}`} className="block text-xs text-primary hover:underline">
                    {when(a)}
                  </Link>
                </div>
                {canWrite && (
                  <span className="flex shrink-0 gap-1">
                    <Button size="sm" variant="outline" title={t("planDone")} disabled={finish.isPending} onClick={() => finish.mutate(a.id)}>
                      <Check className="size-4" />
                      {t("markDone")}
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={t("planRemove")} title={t("planRemove")} disabled={unplan.isPending} onClick={() => unplan.mutate(a.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={t("details")}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <FormField label={t("field.firstName")}>
            <Input disabled={dis} defaultValue={c.firstName} key={`f${c.firstName}`} onBlur={(e) => e.target.value.trim() && e.target.value !== c.firstName && patch.mutate({ firstName: e.target.value.trim() })} />
          </FormField>
          <FormField label={t("field.lastName")}>
            <Input disabled={dis} defaultValue={c.lastName ?? ""} key={`l${c.lastName}`} onBlur={(e) => e.target.value !== (c.lastName ?? "") && patch.mutate({ lastName: e.target.value })} />
          </FormField>
          <FormField label={t("field.position")}>
            <Input disabled={dis} defaultValue={c.position ?? ""} key={`p${c.position}`} onBlur={(e) => e.target.value !== (c.position ?? "") && patch.mutate({ position: e.target.value })} />
          </FormField>
          <FormField label={t("company")}>
            <select className={selectClass} disabled={dis} value={c.companyId ?? ""} onChange={(e) => patch.mutate({ companyId: e.target.value || null })}>
              <option value="">—</option>
              {companies.data?.items.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.legalName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t("field.email")}>
            <Input disabled={dis} defaultValue={c.emails.join(", ")} key={`e${c.emails.join()}`} onBlur={(e) => e.target.value !== c.emails.join(", ") && patch.mutate({ emails: list(e.target.value) })} />
          </FormField>
          <FormField label={t("field.phone")} hint={tm("phoneHint")}>
            <Input disabled={dis} defaultValue={c.phones.join(", ")} key={`ph${c.phones.join()}`} onBlur={(e) => e.target.value !== c.phones.join(", ") && patch.mutate({ phones: list(e.target.value) })} />
          </FormField>
          <FormField label={t("owner")}>
            <select className={selectClass} disabled={dis} value={c.ownerId ?? ""} onChange={(e) => patch.mutate({ ownerId: e.target.value || null })}>
              <option value="">—</option>
              {members.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t("birthday")}>
            <Input type="date" disabled={dis} value={dayInput(c.birthday)} onChange={(e) => patch.mutate({ birthday: dayToIso(e.target.value)?.slice(0, 10) ?? null })} />
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          {(["telegram", "whatsapp", "instagram"] as const).map((m) => (
            <FormField key={m} label={t(`field.${m}`)} hint={tm(`fieldHint.${m}`)}>
              <Input disabled={dis} defaultValue={c.messengers[m] ?? ""} key={`${m}${c.messengers[m]}`} onBlur={(e) => e.target.value !== (c.messengers[m] ?? "") && patch.mutate({ messengers: { [m]: e.target.value } })} />
              {c.messengers[m] && (
                <a className="text-xs text-primary hover:underline" href={messengerLinks[m]?.(c.messengers[m] as string)} target="_blank" rel="noopener noreferrer">
                  {t("open")} ↗
                </a>
              )}
            </FormField>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {c.emails.map((e) => (
            <a key={e} className="text-primary hover:underline" href={`mailto:${e}`}>
              {e}
            </a>
          ))}
          {c.phones.map((p) => (
            <a key={p} className="text-primary hover:underline" href={`tel:${p.replace(/[^\d+]/g, "")}`}>
              {p}
            </a>
          ))}
        </div>
      </Section>

      <Section title={t("consent")}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={dis || consent.isPending} checked={c.consentGiven} onChange={(e) => consent.mutate(e.target.checked)} />
          {t("consentGiven")}
          {c.consentAt && c.consentGiven && <span className="text-xs text-muted-foreground">({new Date(c.consentAt).toLocaleDateString(locale)})</span>}
        </label>
        {c.consentHistory.length > 0 && (
          <ul className="text-xs text-muted-foreground">
            {c.consentHistory.map((h) => (
              <li key={h.id}>
                {new Date(h.givenAt).toLocaleDateString(locale)} · {h.source ?? "—"}
                {h.revokedAt && ` · ${t("revoked", { date: new Date(h.revokedAt).toLocaleDateString(locale) })}`}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t("tabPipeline")} count={c.deals.length}>
        {c.deals.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noDeals")}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {c.deals.map((d) => (
              <li key={d.id}>
                <Link href={`/w/${slug}/crm?deal=${d.id}`} className="hover:underline">
                  {d.title}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {d.stage} · {money(d.amount, d.currency, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {c.access.canShare && (
        <Section title={t("access")}>
          <SharePanel kind="contact" id={contactId} />
        </Section>
      )}

      <Section title={t("tags")} count={c.tags.length}>
        <NodeTags nodeId={contactId} workspaceId={workspaceId} current={c.tags} canWrite={canWrite} onChange={refresh} />
      </Section>

      <Section title={t("activityFeed")} count={feed.data?.total}>
        {feed.data?.items.length === 0 && <p className="text-sm text-muted-foreground">{t("noActivities")}</p>}
        <ul className="flex flex-col gap-2 text-sm">
          {feed.data?.items.map((a) => (
            <ActivityRow key={a.id} a={a} extra={a.dealTitle ?? undefined} />
          ))}
        </ul>
        {(feed.data?.total ?? 0) > (feed.data?.items.length ?? 0) && feedSize < 200 && (
          <Button type="button" variant="ghost" size="sm" className="mt-1 self-start" disabled={feed.isFetching} onClick={() => setFeedSize((n) => Math.min(200, n + 30))} data-testid="feed-more">
            {t("feedMore", { n: (feed.data?.total ?? 0) - (feed.data?.items.length ?? 0) })}
          </Button>
        )}
      </Section>

      <Section title={t("comments")}>
        <Comments nodeId={contactId} meId={meId} canComment />
      </Section>
      <Section title={t("files")}>
        <Attachments nodeId={contactId} items={node?.attachments ?? []} canWrite={canWrite} onChange={refresh} />
      </Section>

      {(canExport || canErase || (canWrite && c.ownerId === meId)) && (
        <Section title={t("privacy")}>
          <div className="flex flex-wrap gap-2">
            {(canExport || (canWrite && c.ownerId === meId)) && (
              <Button size="sm" variant="outline" onClick={exportData}>
                <Download className="size-4" />
                {t("exportPersonalData")}
              </Button>
            )}
            {(canErase || (canWrite && c.ownerId === meId)) && (
              <Button size="sm" variant="danger" onClick={() => setErasing(true)}>
                <ShieldAlert className="size-4" />
                {t("erase")}
              </Button>
            )}
          </div>
        </Section>
      )}

      <ScheduleDialog open={planning} onClose={() => setPlanning(false)} workspaceId={workspaceId} contactId={contactId} companyId={c.companyId} contactName={c.name} onSaved={refresh} />
      <ActivityDialog open={activity !== null} onClose={() => setActivity(null)} workspaceId={workspaceId} defaults={{ type: activity ?? "CALL", contactId, companyId: c.companyId }} onSaved={refresh} />
      <Modal open={replying} onClose={() => setReplying(false)} title={t("replyTitle", { name: c.name })}>
        <FormField label={t("replyText")} hint={t("replyTextHint")}>
          <textarea className={textareaClass} rows={4} value={replyText} onChange={(e) => setReplyText(e.target.value)} data-testid="reply-text" />
        </FormField>
        <FormField label={t("replyWhen")}>
          <Input type="datetime-local" value={replyAt} max={localNow()} onChange={(e) => setReplyAt(e.target.value)} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setReplying(false)}>
            {tc("cancel")}
          </Button>
          <Button disabled={replied.isPending} onClick={() => replied.mutate()} data-testid="reply-save">
            {t("replySave")}
          </Button>
        </div>
      </Modal>
      <Modal open={erasing} onClose={() => (setErasing(false), setConfirm(""))} title={t("eraseTitle", { name: c.name })}>
        <p className="text-sm">{t("eraseBody")}</p>
        <FormField label={t("eraseConfirm")}>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" placeholder="ERASE" />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => (setErasing(false), setConfirm(""))}>
            {tc("cancel")}
          </Button>
          <Button variant="danger" disabled={confirm !== "ERASE" || erase.isPending} onClick={() => erase.mutate()}>
            {t("eraseForever")}
          </Button>
        </div>
      </Modal>
    </aside>
  );
}
