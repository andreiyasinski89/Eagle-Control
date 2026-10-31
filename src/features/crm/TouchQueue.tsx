"use client";

import { SendMaterial } from "./SendMaterial";
import { MessengerButtons } from "./MessengerButtons";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardCopy, Settings, SkipForward, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonRows } from "@/components/ui/skeleton";
import { FormField, Modal } from "@/components/ui/modal";
import { Link } from "@/i18n/navigation";
import { api, ApiFailure } from "@/features/mindmap/api";
import { useTimeZone } from "@/features/views/useTimeZone";
import { cn } from "@/lib/utils";
import { DECLINE_REASONS } from "@/modules/crm/decline";
import type { Stage } from "@/modules/crm/people";
import { cleanTouchSettings, type Situation, type TouchOutcome, type TouchSettings } from "@/modules/crm/touch";
import { addDays, fillScript } from "@/modules/crm/tracker";
import { todayIn, zoneLabel, zonedToUtc } from "@/modules/views/tz";
import { copyToClipboard } from "./useScripts";

interface Recent {
  id: string;
  type: string;
  subject: string;
  body: string | null;
  outcome: string | null;
  at: string;
}
interface QItem {
  id: string;
  name: string;
  firstName: string;
  stage: Stage;
  temperature: "HOT" | "WARM" | "COLD" | null;
  source: string | null;
  position: string | null;
  companyName: string | null;
  city: string | null;
  country: string | null;
  lastContactedAt: string | null;
  nextStep: string | null;
  day: string | null;
  overdue: boolean;
  situation: Situation;
  lastOutcome: string | null;
  telegram: string | null;
  whatsapp: string | null;
  phones: string[];
  messengers: Record<string, string>;
  recent: Recent[];
}
interface QScript {
  id: string;
  title: string;
  stage: string | null;
  situation: string | null;
  body: string;
  shared: boolean;
}
interface QData {
  date: string;
  total: number;
  truncated: boolean;
  items: QItem[];
  scripts: QScript[];
  me: { name: string; link: string | null };
  settings: TouchSettings;
}
interface Done {
  id: string;
  outcome: TouchOutcome;
}
interface Answer {
  nextStep: string;
  nextStepAt: string;
  returnAt: string | null;
  cooled: boolean;
}

const TEMP_ICON = { HOT: "🔥", WARM: "🟡", COLD: "❄️" } as const;

/** The scripts that fit this person now: the right moment and stage first, the team's after one's own, then looser matches. */
export function scriptsFor(item: Pick<QItem, "stage" | "situation">, scripts: readonly QScript[]): QScript[] {
  const exact = scripts.filter((s) => (!s.situation || s.situation === item.situation) && (!s.stage || s.stage === item.stage));
  const pool = exact.length ? exact : scripts.filter((s) => s.situation === item.situation).length ? scripts.filter((s) => s.situation === item.situation) : scripts.filter((s) => s.stage === item.stage);
  const score = (s: QScript) => (s.situation === item.situation ? 2 : 0) + (s.stage === item.stage ? 1 : 0) + (s.shared ? 0 : 0.5);
  return [...pool].sort((a, b) => score(b) - score(a));
}

/**
 * The touch queue: the people whose turn it is, one at a time. Each card has the words ready, a button to open the chat, and five answers;
 * an answer is written down in one go (the feed, the next step, the stage) and the next person is shown.
 */
export function TouchQueue({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const t = useTranslations("touches");
  const qc = useQueryClient();
  const locale = useLocale();
  const key = ["touch-queue", workspaceId, locale];
  const q = useQuery({ queryKey: key, staleTime: 0, refetchOnWindowFocus: false, queryFn: () => api.get<QData>(`/api/v1/workspaces/${workspaceId}/touch-queue?locale=${locale}`) });
  const [session, setSession] = useState<{ ids: string[]; total: number; done: Done[]; skipped: string[] } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // One pass through the queue: its order is fixed when it starts, so a refresh does not shuffle the card under the thumb.
  useEffect(() => {
    if (q.data && !session) setSession({ ids: q.data.items.map((i) => i.id), total: q.data.total, done: [], skipped: [] });
  }, [q.data, session]);

  const byId = useMemo(() => new Map((q.data?.items ?? []).map((i) => [i.id, i])), [q.data]);
  if (q.isLoading || !session || !q.data) return <div className="mx-auto w-full max-w-xl p-4"><SkeletonRows rows={5} /></div>;

  const data = q.data;
  const current = session.ids.map((id) => byId.get(id)).find((i): i is QItem => !!i && !session.skipped.includes(i.id));
  const restart = () => {
    setSession(null);
    void qc.invalidateQueries({ queryKey: key });
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 p-4" data-testid="touch-queue">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        {current && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm tabular-nums" data-testid="touch-progress">
            {t("progress", { n: session.done.length + 1, total: session.total })}
          </span>
        )}
        <Button type="button" variant="ghost" size="sm" className="ml-auto size-11 p-0" aria-label={t("settings")} title={t("settings")} onClick={() => setSettingsOpen(true)} data-testid="touch-settings-open">
          <Settings className="size-5" />
        </Button>
        <Button asChild variant="ghost" size="sm" className="size-11 p-0" aria-label={t("close")} title={t("close")}>
          <Link href={`/w/${slug}`}>
            <X className="size-5" />
          </Link>
        </Button>
      </div>
      {session.total > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.min(100, Math.round((session.done.length / session.total) * 100))}%` }} />
        </div>
      )}

      {current ? (
        <TouchCard
          workspaceId={workspaceId}
          key={current.id}
          item={current}
          data={data}
          slug={slug}
          onDone={(outcome) => setSession((s) => (s ? { ...s, done: [...s.done, { id: current.id, outcome }], ids: s.ids.filter((id) => id !== current.id) } : s))}
          onSkip={() => setSession((s) => (s ? { ...s, skipped: [...s.skipped, current.id] } : s))}
        />
      ) : session.total === 0 ? (
        <Empty slug={slug} />
      ) : (
        <Summary workspaceId={workspaceId} slug={slug} done={session.done} skipped={session.skipped.length} truncated={data.truncated} onAgain={restart} />
      )}

      {settingsOpen && <SettingsDialog workspaceId={workspaceId} initial={data.settings} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function Empty({ slug }: { slug: string }) {
  const t = useTranslations("touches");
  return (
    <section className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-8 text-center" data-testid="touch-empty">
      <h2 className="text-lg font-semibold">{t("emptyTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("emptyText")}</p>
      <Button asChild>
        <Link href={`/w/${slug}/crm/people`}>{t("openPeople")}</Link>
      </Button>
    </section>
  );
}

function TouchCard({ workspaceId, item, data, slug, onDone, onSkip }: { workspaceId: string; item: QItem; data: QData; slug: string; onDone: (o: TouchOutcome) => void; onSkip: () => void }) {
  const t = useTranslations("touches");
  const qc = useQueryClient();
  const tc = useTranslations("crm");
  const locale = useLocale();
  const { tz } = useTimeZone();
  const candidates = useMemo(() => scriptsFor(item, data.scripts), [item, data.scripts]);
  const fill = (body: string) => fillScript(body, { name: item.firstName, fullName: item.name, myName: data.me.name, city: item.city, link: data.me.link });
  const [scriptId, setScriptId] = useState<string | null>(candidates[0]?.id ?? null);
  const [text, setText] = useState(() => (candidates[0] ? fill(candidates[0].body) : ""));
  const [channel, setChannel] = useState<"telegram" | "whatsapp" | "instagram" | "copy" | undefined>();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"meeting" | "decline" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const say = (msg: string, ms = 3500) => {
    setNote(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), ms);
  };
  const dateOf = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });

  const pick = (s: QScript) => {
    setScriptId(s.id);
    setText(fill(s.body));
  };
  async function send(kind: "copy") {
    setChannel(kind);
    say((await copyToClipboard(text)) ? t("copied") : t("copyFailed"));
  }

  const result = useMutation({
    mutationFn: (body: { outcome: TouchOutcome; meetingAt?: string; declineReason?: string }) => api.post<Answer>(`/api/v1/contacts/${item.id}/touch`, { ...body, message: text.trim() || undefined, channel, locale }),
    onSuccess: (r, body) => {
      setDialog(null);
      setError(null);
      const when = dateOf(r.nextStepAt);
      say(body.outcome === "DECLINED" ? t("declineNote", { date: dateOf(r.returnAt ?? r.nextStepAt) }) : r.cooled ? t("cooledNote", { date: dateOf(r.returnAt ?? r.nextStepAt) }) : `${t("saved")} ${t("nextStepIs", { step: r.nextStep, date: when })}`, 5000);
      for (const k of ["my-day", "people", "contacts", "tracker", "contact"]) void qc.invalidateQueries({ queryKey: [k] });
      onDone(body.outcome);
    },
    onError: (e) => setError(e instanceof ApiFailure && e.message ? e.message : t("failed")),
  });

  const stageLabel = tc(`funnelStage.${item.stage}`);
  const where = [item.companyName ?? item.position, item.city ?? item.country].filter(Boolean).join(" · ");

  return (
    <>
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4" data-testid="touch-card">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/w/${slug}/crm/contacts?contact=${item.id}`} className="text-2xl font-semibold hover:underline" data-testid="touch-name">
            {item.name}
          </Link>
          {item.temperature && (
            <span className="text-xl" title={tc(`temp.${item.temperature}`)} aria-label={tc(`temp.${item.temperature}`)} data-testid="touch-temperature">
              {TEMP_ICON[item.temperature]}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 font-medium text-primary">{stageLabel}</span>
          <span className={cn("rounded-full px-2.5 py-0.5 font-medium", item.overdue ? "bg-[var(--health-red)]/15 text-[var(--health-red)]" : "bg-muted text-muted-foreground")}>{item.overdue ? t("overdue") : t("dueToday")}</span>
        </div>
        <dl className="grid gap-1 text-sm">
          {where && <dd className="text-muted-foreground">{where}</dd>}
          {item.source && (
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">{t("knownFrom")}:</dt>
              <dd>{item.source}</dd>
            </div>
          )}
          <dd className="text-muted-foreground">{item.lastContactedAt ? t("lastTouch", { date: new Date(item.lastContactedAt).toLocaleDateString(locale, { day: "numeric", month: "short" }) }) : t("neverTouched")}</dd>
          {item.nextStep && (
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">{t("nextStep")}:</dt>
              <dd>{item.nextStep}</dd>
            </div>
          )}
        </dl>
        <div>
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("recentTitle")}</h2>
          {item.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noRecent")}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm" data-testid="touch-recent">
              {item.recent.map((a) => (
                <li key={a.id} className="flex gap-2">
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{new Date(a.at).toLocaleDateString(locale, { day: "numeric", month: "short" })}</span>
                  <span className="min-w-0 truncate">{a.body ? `${a.subject}: ${a.body}` : a.subject}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-medium">{t("scriptTitle")}</h2>
        {candidates.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("scriptPick")} data-testid="touch-scripts">
            {candidates.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={s.id === scriptId} onClick={() => pick(s)} className={cn("min-h-9 rounded-full border px-3 py-1 text-xs", s.id === scriptId ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground")}>
                {s.title}
              </button>
            ))}
          </div>
        )}
        {candidates.length === 0 && <p className="text-xs text-muted-foreground">{t("noScript")}</p>}
        <textarea className="min-h-36 w-full rounded-md border border-border bg-background p-3 text-sm" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} aria-label={t("scriptTitle")} data-testid="touch-text" />
        <p className="text-xs text-muted-foreground">{t("scriptHint")}</p>
        <SendMaterial workspaceId={workspaceId} className="w-fit" onPick={(line) => setText((cur) => `${cur.trimEnd()}${cur.trim() ? "\n\n" : ""}${line}`.slice(0, 4000))} />
        <MessengerButtons workspaceId={workspaceId} person={{ id: item.id, name: item.name, phones: item.phones, messengers: item.messengers }} text={text} canWrite onUsed={(c) => setChannel(c)} />
        <Button type="button" variant="outline" className="min-h-11 w-full gap-2" disabled={!text.trim()} onClick={() => void send("copy")} data-testid="touch-copy">
          <ClipboardCopy className="size-4" />
          {t("copy")}
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">{t("resultTitle")}</h2>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" className="min-h-12" disabled={result.isPending} onClick={() => result.mutate({ outcome: "REPLIED" })} data-testid="touch-replied">
            <Check className="size-4" />
            {t("replied")}
          </Button>
          <Button type="button" variant="outline" className="min-h-12" disabled={result.isPending} onClick={() => result.mutate({ outcome: "NO_REPLY" })} data-testid="touch-no-reply">
            {t("noReply")}
          </Button>
          <Button type="button" variant="outline" className="min-h-12" disabled={result.isPending} onClick={() => setDialog("meeting")} data-testid="touch-meeting">
            {t("meetingSet")}
          </Button>
          <Button type="button" variant="outline" className="min-h-12" disabled={result.isPending} onClick={() => setDialog("decline")} data-testid="touch-declined">
            {t("declined")}
          </Button>
        </div>
        <Button type="button" variant="ghost" className="min-h-11" onClick={onSkip} data-testid="touch-skip">
          <SkipForward className="size-4" />
          {t("skip")}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-danger" data-testid="touch-error">
            {error}
          </p>
        )}
      </section>

      {note && (
        <p role="status" className="sticky bottom-4 rounded-xl border border-border bg-card p-3 text-sm shadow-lg" data-testid="touch-note">
          {note}
        </p>
      )}

      {dialog === "meeting" && <MeetingDialog tz={tz} busy={result.isPending} onClose={() => setDialog(null)} onSave={(meetingAt) => result.mutate({ outcome: "MEETING_SET", meetingAt })} />}
      {dialog === "decline" && <DeclineDialog busy={result.isPending} onClose={() => setDialog(null)} onSave={(declineReason) => result.mutate({ outcome: "DECLINED", declineReason })} />}
    </>
  );
}

function MeetingDialog({ tz, busy, onClose, onSave }: { tz: string; busy: boolean; onClose: () => void; onSave: (iso: string) => void }) {
  const t = useTranslations("touches");
  const tcm = useTranslations("common");
  const [day, setDay] = useState(() => addDays(todayIn(tz), 1));
  const [time, setTime] = useState("12:00");
  return (
    <Modal open onClose={onClose} title={t("meetingTitle")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(zonedToUtc(day, time, tz).toISOString());
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t("meetingDay")}>
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} required className="min-h-11" data-testid="touch-meeting-day" />
          </FormField>
          <FormField label={t("meetingTime")}>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} required className="min-h-11" data-testid="touch-meeting-time" />
          </FormField>
        </div>
        <p className="text-xs text-muted-foreground">{t("meetingZone", { zone: zoneLabel(tz) })}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>
            {tcm("cancel")}
          </Button>
          <Button type="submit" className="min-h-11" disabled={busy || !day || !time} data-testid="touch-meeting-save">
            {t("meetingSave")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeclineDialog({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (reason: string) => void }) {
  const t = useTranslations("touches");
  const tc = useTranslations("crm");
  const tcm = useTranslations("common");
  const [reason, setReason] = useState<string>("");
  return (
    <Modal open onClose={onClose} title={t("declineTitle")}>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label={t("declineTitle")}>
        {DECLINE_REASONS.map((r) => (
          <label key={r} className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm", reason === r ? "border-primary bg-primary/5" : "border-border")}>
            <input type="radio" name="decline" checked={reason === r} onChange={() => setReason(r)} data-testid={`touch-reason-${r}`} />
            {tc(`declineReason.${r}`)}
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>
          {tcm("cancel")}
        </Button>
        <Button type="button" className="min-h-11" disabled={busy || !reason} onClick={() => onSave(reason)} data-testid="touch-decline-save">
          {t("declineSave")}
        </Button>
      </div>
    </Modal>
  );
}

function Summary({ workspaceId, slug, done, skipped, truncated, onAgain }: { workspaceId: string; slug: string; done: Done[]; skipped: number; truncated: boolean; onAgain: () => void }) {
  const t = useTranslations("touches");
  const plan = useQuery({ queryKey: ["my-day", workspaceId], queryFn: () => api.get<{ plan: { followUps: { planned: number; done: number }; meetings: { planned: number; done: number } } }>(`/api/v1/workspaces/${workspaceId}/my-day`) });
  const count = (o: TouchOutcome) => done.filter((d) => d.outcome === o).length;
  const rows: [string, number][] = [
    [t("summaryTouches"), done.length],
    [t("summaryReplies"), count("REPLIED")],
    [t("summaryMeetings"), count("MEETING_SET")],
    [t("summaryNoReply"), count("NO_REPLY")],
    [t("summaryDeclines"), count("DECLINED")],
    [t("summarySkipped"), skipped],
  ];
  const p = plan.data?.plan;
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5" data-testid="touch-summary">
      <h2 className="text-lg font-semibold">{t("summaryTitle")}</h2>
      <dl className="grid grid-cols-2 gap-3">
        {rows.map(([label, n]) => (
          <div key={label} className="rounded-xl bg-muted/50 p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
      {p && <p className="text-sm">{t("summaryVsPlan", { done: p.followUps.done, planned: p.followUps.planned, mdone: p.meetings.done, mplanned: p.meetings.planned })}</p>}
      {truncated && <p className="text-xs text-muted-foreground">{t("more")}</p>}
      <div className="flex flex-wrap gap-2">
        <Button asChild className="min-h-11">
          <Link href={`/w/${slug}`}>{t("summaryDay")}</Link>
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={onAgain}>
          {t("summaryAgain")}
        </Button>
      </div>
    </section>
  );
}

function SettingsDialog({ workspaceId, initial, onClose }: { workspaceId: string; initial: TouchSettings; onClose: () => void }) {
  const t = useTranslations("touches");
  const qc = useQueryClient();
  const [s, setS] = useState<TouchSettings>(() => cleanTouchSettings(initial));
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/workspaces/${workspaceId}/touch-settings`, { replyDays: s.replyDays, noReplyDays: s.noReplyDays, declineDays: s.declineDays, meetingMovesStage: s.meetingMovesStage }),
    onSuccess: () => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ["touch-queue", workspaceId] });
    },
  });
  const pick = <K extends keyof TouchSettings>(k: K, v: TouchSettings[K]) => (setSaved(false), setS((x) => ({ ...x, [k]: v })));
  const choose = (label: string, value: number, options: number[], k: "replyDays" | "noReplyDays" | "declineDays") => (
    <FormField label={label}>
      <select className="min-h-11 w-full rounded-md border border-border bg-card px-2 text-sm" value={value} onChange={(e) => pick(k, Number(e.target.value))} data-testid={`touch-setting-${k}`}>
        {options.map((n) => (
          <option key={n} value={n}>
            {t("days", { n })}
          </option>
        ))}
      </select>
    </FormField>
  );
  return (
    <Modal open onClose={onClose} title={t("settings")}>
      <p className="text-sm text-muted-foreground">{t("settingsHint")}</p>
      {choose(t("afterReply"), s.replyDays, [1, 2, 3], "replyDays")}
      {choose(t("afterNoReply"), s.noReplyDays, [2, 3], "noReplyDays")}
      {choose(t("afterDecline"), s.declineDays, [60, 75, 90], "declineDays")}
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={s.meetingMovesStage} onChange={(e) => pick("meetingMovesStage", e.target.checked)} data-testid="touch-setting-meeting" />
        {t("meetingMoves")}
      </label>
      <p className="text-xs text-muted-foreground">{t("coolNote")}</p>
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span role="status" className="text-xs text-muted-foreground">
            {t("settingsSaved")}
          </span>
        )}
        <Button type="button" className="min-h-11" disabled={save.isPending} onClick={() => save.mutate()} data-testid="touch-settings-save">
          {t("settingsSave")}
        </Button>
      </div>
    </Modal>
  );
}
