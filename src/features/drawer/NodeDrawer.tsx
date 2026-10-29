"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Link2, Share2, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { archiveNode, completeNode, createChild, rename, reload, updateNode } from "@/features/mindmap/actions";
import { api, ApiFailure } from "@/features/mindmap/api";
import { TYPE_ICON } from "@/features/mindmap/NodeCard";
import { useMapStore } from "@/features/mindmap/store";
import type { ClientNode } from "@/features/mindmap/types";
import { useSelection } from "@/features/mindmap/useSelection";
import { allowedChildTypes } from "@/modules/nodes/node-rules";
import { eventSummary, presetOf, ruleFromPreset, type Preset, type Repeat } from "@/modules/nodes/repeat";
import { RepeatFields } from "@/features/views/RepeatFields";
import { useTimeZone } from "@/features/views/useTimeZone";
import type { PatchNodeInput } from "@/modules/nodes/schemas";
import { cn } from "@/lib/utils";
import { Attachments } from "./Attachments";
import { Comments } from "./Comments";
import { DocumentEditor } from "./DocumentEditor";
import { SprintSummary } from "./SprintSummary";
import { TimeSection } from "@/features/time/TimeSection";
import { AiBreakdown } from "@/features/ai/ai";
import { ClientSection } from "./ClientSection";
import { peopleOn, usePresenceStore } from "@/features/realtime/presence-store";
import type { NodeDetail, TagDto } from "./types";

const STATUSES = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"] as const;
const HEALTHS = ["GREEN", "YELLOW", "RED"] as const;
const TAG_COLORS = ["#6366f1", "#16a34a", "#d97706", "#dc2626", "#0891b2", "#9333ea"];

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

const selectCls = "h-9 rounded-md border border-border bg-card px-2 text-sm disabled:opacity-60";

const dateValue = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const toIsoDay = (v: string) => (v ? `${v}T00:00:00.000Z` : null);
function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function NodeDrawer({ rootId }: { rootId: string }) {
  const { selectedId, select } = useSelection();
  const node = useMapStore((s) => (selectedId ? s.nodes[selectedId] : undefined));
  const t = useTranslations("drawer");
  if (!selectedId) return null;
  return (
    <aside
      aria-label={t("title")}
      data-testid="drawer"
      className="z-40 flex w-[420px] shrink-0 flex-col overflow-y-auto border-l border-border bg-card max-md:fixed max-md:inset-0 max-md:w-full"
      onFocusCapture={(e) => {
        const el = e.target;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) usePresenceStore.getState().setEditing(selectedId);
      }}
      onBlurCapture={() => usePresenceStore.getState().setEditing(null)}
    >
      {node ? (
        <DrawerBody key={node.id} node={node} isRoot={node.id === rootId} close={() => select(null)} />
      ) : (
        <div className="flex items-center justify-between p-4 text-sm text-muted-foreground">
          {t("notFound")}
          <Button variant="ghost" size="sm" onClick={() => select(null)} aria-label={t("close")}>
            <X className="size-4" />
          </Button>
        </div>
      )}
    </aside>
  );
}

function DrawerBody({ node, isRoot, close }: { node: ClientNode; isRoot: boolean; close: () => void }) {
  const t = useTranslations("drawer");
  const tl = useTranslations("live");
  const tm = useTranslations("map");
  const locale = useLocale();
  const qc = useQueryClient();
  const { select } = useSelection();
  const people = useMapStore((s) => s.people);
  const role = useMapStore((s) => s.role);
  const meId = useMapStore((s) => s.meId);
  const workspaceId = useMapStore((s) => s.workspaceId);
  const allNodes = useMapStore((s) => s.nodes);
  const canWrite = role !== "CLIENT";
  const [copied, setCopied] = useState(false);

  const { data: detail } = useQuery({ queryKey: ["node", node.id], queryFn: () => api.get<NodeDetail>(`/api/v1/nodes/${node.id}`) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["node", node.id] });
    void qc.invalidateQueries({ queryKey: ["activity", node.id] });
  };
  const save = async (patch: Partial<PatchNodeInput>) => {
    await updateNode(node.id, patch);
    refresh();
  };

  const Icon = TYPE_ICON[node.type];
  const countable = node.type !== "DOCUMENT" && node.type !== "EVENT";
  const health = node.healthOverride ?? node.health;
  const childTypes = allowedChildTypes(node.type);
  const data = detail?.node.data ?? {};
  const hasKids = Object.values(allNodes).some((n) => n.parentId === node.id && n.type !== "DOCUMENT" && n.type !== "EVENT");
  const derived = hasKids && !(node.type === "TASK" && node.progressMode === "MANUAL");
  const isTask = node.type === "TASK" || node.type === "SUBTASK";
  const projectUnit = useMapStore((s) => (s.projectId ? s.nodes[s.projectId]?.estimationUnit : null)) ?? "HOURS";

  const others = usePresenceStore((s) => s.others);
  const editors = peopleOn(others, node.id).editors;

  return (
    <>
      {editors.length > 0 && (
        <div role="status" data-testid="editing-banner" className="px-4 py-1.5 text-xs font-medium text-white" style={{ background: editors[0]?.color }}>
          {tl("editingHere", { names: [...new Set(editors.map((u) => u.name))].join(", ") })}
        </div>
      )}
      <header className="flex items-start gap-2 p-4">
        <Icon className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">
            {detail?.breadcrumb.map((b) => (
              <button key={b.id} className="hover:underline" onClick={() => select(b.id)}>
                {b.title} ›{" "}
              </button>
            ))}
            {tm(`type.${node.type}`)}
          </div>
          {canWrite ? (
            <Input
              key={node.title}
              aria-label={t("titleField")}
              defaultValue={node.title}
              className="mt-1 h-auto border-transparent bg-transparent px-1 py-1 text-lg font-semibold hover:border-border"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v) e.target.value = node.title;
                else void rename(node.id, v).then(refresh);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
          ) : (
            <h2 className="mt-1 text-lg font-semibold">{node.title}</h2>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("share")}
          title={copied ? t("copied") : t("share")}
          onClick={() => {
            void navigator.clipboard?.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Share2 className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={close} aria-label={t("close")}>
          <X className="size-4" />
        </Button>
      </header>

      {countable && (
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full" style={{ background: `var(--health-${health.toLowerCase()})` }} role="img" aria-label={tm(`health.${health}`)} />
            <span className="text-sm font-medium" data-testid="drawer-health">
              {tm(`health.${health}`)}
            </span>
            {node.healthOverride && <span className="rounded bg-muted px-1.5 text-xs">{t("overridden")}</span>}
            {node.blocked && <span className="rounded bg-[var(--health-red)]/15 px-1.5 text-xs text-[var(--health-red)]">{tm("blocked")}</span>}
            <span className="ml-auto text-sm tabular-nums">{node.progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full" style={{ width: `${node.progress}%`, background: `var(--health-${health.toLowerCase()})` }} />
          </div>
          {node.healthOverride && detail?.node.healthOverrideNote && <p className="mt-2 text-xs text-muted-foreground">“{detail.node.healthOverrideNote}”</p>}
          {canWrite && <HealthOverride node={node} onDone={() => { refresh(); void reload(); }} />}
        </div>
      )}

      {canWrite && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {isTask && node.status !== "DONE" && (
            <Button size="sm" onClick={() => void completeNode(node.id).then(refresh)}>
              <CheckCircle2 className="size-4" />
              {t("markComplete")}
            </Button>
          )}
          {childTypes.map((type) => (
            <Button
              key={type}
              size="sm"
              variant="outline"
              onClick={() => void createChild(node.id, type, tm(`new.${type}`)).then((id) => id && select(id))}
            >
              + {tm(`type.${type}`)}
            </Button>
          ))}
          {node.type === "TASK" && !childTypes.includes("DOCUMENT") ? null : null}
          {!isRoot && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                const parent = node.parentId;
                void archiveNode(node.id).then(() => select(parent));
              }}
            >
              <Trash2 className="size-4" />
              {t("delete")}
            </Button>
          )}
        </div>
      )}

      {countable && (
        <Section title={t("details")}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("status")}>
              <select className={selectCls} disabled={!canWrite} value={node.status} onChange={(e) => void save({ status: e.target.value as ClientNode["status"] })}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {tm(`status.${s}`)}
                  </option>
                ))}
              </select>
            </Field>
            {isTask && (
              <Field label={node.assigneeId ? t("reassign") : t("assignee")}>
                <select className={selectCls} disabled={!canWrite} value={node.assigneeId ?? ""} onChange={(e) => void save({ assigneeId: e.target.value || null })}>
                  <option value="">{t("unassigned")}</option>
                  {Object.values(people).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name ?? p.email}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={t("start")}>
              <Input type="date" disabled={!canWrite} value={dateValue(node.startDate)} max={dateValue(node.dueDate) || undefined} onChange={(e) => void save({ startDate: toIsoDay(e.target.value) })} />
            </Field>
            <Field label={t("due")}>
              <Input type="date" disabled={!canWrite} value={dateValue(node.dueDate)} min={dateValue(node.startDate) || undefined} onChange={(e) => void save({ dueDate: toIsoDay(e.target.value) })} />
            </Field>
            {isTask && (
              <div data-advanced className="contents">
              <Field label={t("estimation")}>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    step="0.5"
                    disabled={!canWrite}
                    defaultValue={node.estimation ?? ""}
                    key={node.estimation ?? "none"}
                    className="min-w-0 flex-1"
                    data-testid="estimation-input"
                    onBlur={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      if (v !== node.estimation) void save({ estimation: v });
                    }}
                  />
                  <select
                    className={`${selectCls} w-32 shrink-0`}
                    disabled={!canWrite}
                    value={node.estimationUnit ?? projectUnit}
                    aria-label={t("estimationUnit")}
                    title={t("estimationUnitHint")}
                    data-testid="estimation-unit"
                    onChange={(e) => void save({ estimationUnit: e.target.value as "HOURS" | "STORY_POINTS" })}
                  >
                    <option value="STORY_POINTS">{t("unitStoryPoints")}</option>
                    <option value="HOURS">{t("unitHours")}</option>
                  </select>
                </div>
              </Field>
              </div>
            )}
            {node.type === "PROJECT" && (
              <div data-advanced className="contents">
              <Field label={t("projectUnit")}>
                <select className={selectCls} disabled={!canWrite} value={node.estimationUnit ?? "HOURS"} onChange={(e) => void save({ estimationUnit: e.target.value as "HOURS" | "STORY_POINTS" })} data-testid="project-unit">
                  <option value="STORY_POINTS">{t("unitStoryPoints")}</option>
                  <option value="HOURS">{t("unitHours")}</option>
                </select>
                <span className="text-xs text-muted-foreground">{t("estimationUnitHint")}</span>
              </Field>
              </div>
            )}
            {node.type === "TASK" && hasKids && (
              <Field label={t("progressMode")}>
                <select className={selectCls} disabled={!canWrite} value={node.progressMode} onChange={(e) => void save({ progressMode: e.target.value as "MANUAL" | "AUTO" })}>
                  <option value="MANUAL">{t("manual")}</option>
                  <option value="AUTO">{t("auto")}</option>
                </select>
              </Field>
            )}
          </div>
          <Field label={`${t("progress")} — ${node.progress}%`}>
            {derived ? (
              <span className="text-xs text-muted-foreground">{t("progressDerived")}</span>
            ) : (
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                disabled={!canWrite}
                value={node.progress}
                aria-label={t("progress")}
                onChange={(e) => useMapStore.getState().patchLocal(node.id, { progress: Number(e.target.value) })}
                onPointerUp={(e) => void save({ progress: Number(e.currentTarget.value) })}
                onKeyUp={(e) => void save({ progress: Number(e.currentTarget.value) })}
              />
            )}
          </Field>
        </Section>
      )}

      {(node.type === "SPRINT" || node.type === "EPIC" || node.type === "PROJECT") && detail && (
        <Section title={t("summary")}>
          <SprintSummary detail={detail} />
        </Section>
      )}

      {node.type === "DOCUMENT" && detail && (
        <Section title={t("document")}>
          <div className="text-xs text-muted-foreground">
            {t("createdBy", { name: people[detail.node.createdById]?.name ?? people[detail.node.createdById]?.email ?? "—", date: new Date(detail.node.createdAt).toLocaleDateString(locale) })}
          </div>
          <Field label={t("docKind")}>
            <select className={selectCls} disabled={!canWrite} value={(data.kind as string) ?? "note"} onChange={(e) => void save({ data: { ...data, kind: e.target.value } })}>
              {["note", "spec", "pdf"].map((k) => (
                <option key={k} value={k}>
                  {t(`kind.${k}`)}
                </option>
              ))}
            </select>
          </Field>
          <DocumentEditor nodeId={node.id} data={data} editable={canWrite} onSaved={refresh} />
        </Section>
      )}

      {node.type === "EVENT" && detail && <EventSection node={node} data={data} canWrite={canWrite} save={save} />}

      <Section title={t("description")}>
        <textarea
          key={detail?.node.description ?? ""}
          aria-label={t("description")}
          disabled={!canWrite}
          defaultValue={detail?.node.description ?? ""}
          className="min-h-16 rounded-md border border-border bg-card p-2 text-sm"
          onBlur={(e) => {
            if (e.target.value !== (detail?.node.description ?? "")) void save({ description: e.target.value || null });
          }}
        />
      </Section>

      {workspaceId && detail && <TagsSection node={node} workspaceId={workspaceId} current={detail.tags} canWrite={canWrite} onChange={refresh} />}
      {detail && countable && (
        <div data-advanced className="contents">
          <LinksSection node={node} detail={detail} canWrite={canWrite} onChange={() => { refresh(); void reload(); }} />
        </div>
      )}

      {(node.type === "TASK" || node.type === "SUBTASK") && (
        <Section title={t("time")}>
          <TimeSection nodeId={node.id} meId={meId} canWrite={canWrite} isAdmin={role === "OWNER" || role === "ADMIN"} />
        </Section>
      )}

      {canWrite && workspaceId && (node.type === "TASK" || node.type === "EPIC" || node.type === "SPRINT") && (
        <Section title="AI">
          <AiBreakdown nodeId={node.id} workspaceId={workspaceId} onCreated={() => { refresh(); void reload(); }} />
        </Section>
      )}

      {!isRoot && node.type !== "PROJECT" && (
        <Section title={t("client")}>
          <ClientSection nodeId={node.id} shared={node.visibleToClient} canWrite={canWrite} onShare={(v) => void save({ visibleToClient: v })} />
        </Section>
      )}

      <Section title={t("comments")}>
        <Comments nodeId={node.id} meId={meId} canComment shared={node.visibleToClient} />
      </Section>
      <Section title={t("attachments")}>
        <Attachments nodeId={node.id} items={detail?.attachments ?? []} canWrite={canWrite} onChange={refresh} shared={node.visibleToClient} />
      </Section>
      <ActivitySection nodeId={node.id} />
    </>
  );
}

function HealthOverride({ node, onDone }: { node: ClientNode; onDone: () => void }) {
  const t = useTranslations("drawer");
  const tm = useTranslations("map");
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<(typeof HEALTHS)[number]>("GREEN");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setError(null);
    try {
      await api.post(`/api/v1/nodes/${node.id}/health-override`, { health, note });
      setOpen(false);
      setNote("");
      onDone();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : t("error"));
    }
  }
  return (
    <div className="mt-2">
      {node.healthOverride ? (
        <button
          className="text-xs text-primary hover:underline"
          onClick={async () => {
            await api.del(`/api/v1/nodes/${node.id}/health-override`);
            onDone();
          }}
        >
          {t("clearOverride")}
        </button>
      ) : (
        <button className="text-xs text-primary hover:underline" onClick={() => setOpen((v) => !v)}>
          {t("override")}
        </button>
      )}
      {open && !node.healthOverride && (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-border p-2">
          <select className={selectCls} value={health} aria-label={t("override")} onChange={(e) => setHealth(e.target.value as typeof health)}>
            {HEALTHS.map((h) => (
              <option key={h} value={h}>
                {tm(`health.${h}`)}
              </option>
            ))}
          </select>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} aria-label={t("overrideNote")} placeholder={t("overrideNote")} className="min-h-14 rounded-md border border-border bg-card p-2 text-sm" />
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <Button size="sm" disabled={note.trim().length < 3} onClick={apply}>
            {t("applyOverride")}
          </Button>
        </div>
      )}
    </div>
  );
}

function EventSection({ node, data, canWrite, save }: { node: ClientNode; data: Record<string, unknown>; canWrite: boolean; save: (p: Partial<PatchNodeInput>) => Promise<void> }) {
  const t = useTranslations("drawer");
  const tm = useTranslations("map");
  const { select } = useSelection();
  const people = useMapStore((s) => s.people);
  const attendees = (data.attendeeIds as string[] | undefined) ?? [];
  const url = typeof data.meetingUrl === "string" ? data.meetingUrl : "";
  const merge = async (patch: Record<string, unknown>) => {
    const next = { ...data, ...patch };
    await save({ data: next });
    // The card on the map shows when and how the event repeats; keep it in step with what was just saved.
    useMapStore.getState().patchLocal(node.id, { event: eventSummary(next) });
  };
  const iso = (v: string) => (v ? new Date(v).toISOString() : undefined);
  const validUrl = /^https?:\/\//i.test(url);
  return (
    <Section title={t("event")}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("startsAt")}>
          <Input type="datetime-local" disabled={!canWrite} defaultValue={toLocalInput(data.startsAt as string | undefined)} onBlur={(e) => void merge({ startsAt: iso(e.target.value) })} />
        </Field>
        <Field label={t("endsAt")}>
          <Input type="datetime-local" disabled={!canWrite} defaultValue={toLocalInput(data.endsAt as string | undefined)} onBlur={(e) => void merge({ endsAt: iso(e.target.value) })} />
        </Field>
      </div>
      <RepeatSection data={data} canWrite={canWrite} merge={merge} />
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1">
        <legend className="mb-1 text-xs text-muted-foreground">{t("attendees")}</legend>
        {Object.values(people).map((p) => (
          <label key={p.id} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              disabled={!canWrite}
              checked={attendees.includes(p.id)}
              onChange={(e) => void merge({ attendeeIds: e.target.checked ? [...attendees, p.id] : attendees.filter((x) => x !== p.id) })}
            />
            {p.name ?? p.email}
          </label>
        ))}
      </fieldset>
      <Field label={t("agenda")}>
        <textarea disabled={!canWrite} defaultValue={(data.agenda as string) ?? ""} className="min-h-20 rounded-md border border-border bg-card p-2 text-sm" onBlur={(e) => void merge({ agenda: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={!canWrite} checked={data.addMeet === true} onChange={(e) => void merge({ addMeet: e.target.checked })} />
        {t("addMeet")}
      </label>
      <Field label={t("meetingUrl")}>
        <Input type="url" disabled={!canWrite} defaultValue={url} placeholder="https://" onBlur={(e) => void merge({ meetingUrl: e.target.value || undefined })} />
      </Field>
      <div className="flex gap-2">
        {validUrl && (
          <Button asChild size="sm">
            <a href={url} target="_blank" rel="noopener noreferrer">
              {t("join")}
            </a>
          </Button>
        )}
        {canWrite && (
          <Button size="sm" variant="outline" onClick={() => void createChild(node.id, "DOCUMENT", `${t("notes")}: ${node.title}`).then((id) => id && select(id))} title={tm("type.DOCUMENT")}>
            {t("addNote")}
          </Button>
        )}
      </div>
    </Section>
  );
}

/** The repeat rule of an event, and the dates of the series that are left out. One event stands for every date, so this is the only place to change them all. */
function RepeatSection({ data, canWrite, merge }: { data: Record<string, unknown>; canWrite: boolean; merge: (patch: Record<string, unknown>) => Promise<void> }) {
  const t = useTranslations("views");
  const { tz } = useTimeZone();
  const repeat = data.repeat as Repeat | undefined;
  const [skipDay, setSkipDay] = useState("");
  const setRepeat = (next: Repeat | null) => void merge({ repeat: next ?? undefined });
  const skipped = repeat?.skip ?? [];
  return (
    <div className="flex flex-col gap-2" data-testid="repeat-section">
      <RepeatFields
        preset={presetOf(repeat)}
        until={repeat?.until ?? ""}
        disabled={!canWrite}
        onPreset={(p: Preset) => setRepeat(ruleFromPreset(p, repeat?.tz ?? tz, repeat))}
        onUntil={(d) => repeat && setRepeat({ ...repeat, until: d || undefined })}
      />
      {repeat && canWrite && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t("repeatSkip")}
            <Input type="date" value={skipDay} onChange={(e) => setSkipDay(e.target.value)} className="w-40" data-testid="repeat-skip-day" />
          </label>
          <Button
            size="sm"
            variant="outline"
            disabled={!skipDay || skipped.includes(skipDay)}
            onClick={() => {
              setRepeat({ ...repeat, skip: [...skipped, skipDay].sort() });
              setSkipDay("");
            }}
            data-testid="repeat-skip-add"
          >
            {t("repeatSkip")}
          </Button>
        </div>
      )}
      {skipped.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 text-xs" aria-label={t("repeatSkipped", { n: skipped.length })}>
          {skipped.map((d) => (
            <li key={d} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
              {d}
              {canWrite && repeat && (
                <button type="button" className="text-primary hover:underline" onClick={() => setRepeat({ ...repeat, skip: skipped.filter((x) => x !== d) })}>
                  {t("repeatRestore")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TagsSection({ node, workspaceId, current, canWrite, onChange }: { node: ClientNode; workspaceId: string; current: TagDto[]; canWrite: boolean; onChange: () => void }) {
  const t = useTranslations("drawer");
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const { data: all = [] } = useQuery({ queryKey: ["tags", workspaceId], queryFn: () => api.get<TagDto[]>(`/api/v1/workspaces/${workspaceId}/tags`) });
  const ids = new Set(current.map((x) => x.id));

  async function setTags(next: string[]) {
    await api.put(`/api/v1/nodes/${node.id}/tags`, { tagIds: next });
    useMapStore.getState().patchLocal(node.id, { tagIds: next });
    onChange();
  }
  async function addNew() {
    const n = name.trim();
    if (!n) return;
    const color = TAG_COLORS[all.length % TAG_COLORS.length] ?? "#6366f1";
    const tag = await api.post<TagDto>(`/api/v1/workspaces/${workspaceId}/tags`, { name: n, color }).catch(() => all.find((x) => x.name === n));
    setName("");
    await qc.invalidateQueries({ queryKey: ["tags", workspaceId] });
    if (tag) await setTags([...ids, tag.id]);
  }

  return (
    <Section title={t("tags")}>
      <div className="flex flex-wrap gap-1.5">
        {all.map((tag) => {
          const on = ids.has(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              aria-pressed={on}
              disabled={!canWrite}
              onClick={() => void setTags(on ? [...ids].filter((x) => x !== tag.id) : [...ids, tag.id])}
              className={cn("rounded-full border px-2 py-0.5 text-xs", on ? "border-transparent" : "border-border opacity-60 hover:opacity-100")}
              style={on ? { background: `${tag.color}33`, borderColor: tag.color } : undefined}
            >
              {tag.name}
            </button>
          );
        })}
        {all.length === 0 && <span className="text-sm text-muted-foreground">{t("noTags")}</span>}
      </div>
      {canWrite && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void addNew();
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("tagName")} aria-label={t("tagName")} maxLength={40} />
          <Button type="submit" size="sm" variant="outline" disabled={!name.trim()}>
            {t("addTag")}
          </Button>
        </form>
      )}
    </Section>
  );
}

function LinksSection({ node, detail, canWrite, onChange }: { node: ClientNode; detail: NodeDetail; canWrite: boolean; onChange: () => void }) {
  const t = useTranslations("drawer");
  const { select } = useSelection();
  const allNodes = useMapStore((s) => s.nodes);
  const [mode, setMode] = useState<"blocks" | "blockedBy" | "relates">("blocks");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const options = Object.values(allNodes).filter((n) => n.id !== node.id);

  const label = (l: NodeDetail["links"][number]) =>
    l.kind === "BLOCKS" ? (l.direction === "out" ? t("blocks") : t("blockedBy")) : l.kind === "ATTACHED" ? t("attached") : t("relates");

  async function add() {
    setError(null);
    try {
      if (mode === "blockedBy") await api.post(`/api/v1/nodes/${target}/links`, { toNodeId: node.id, kind: "BLOCKS" });
      else await api.post(`/api/v1/nodes/${node.id}/links`, { toNodeId: target, kind: mode === "blocks" ? "BLOCKS" : "RELATES" });
      setTarget("");
      onChange();
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : t("error"));
    }
  }

  return (
    <Section title={t("links")}>
      {detail.links.length === 0 && <p className="text-sm text-muted-foreground">{t("noLinks")}</p>}
      <ul className="flex flex-col gap-1">
        {detail.links.map((l) => (
          <li key={l.id} className="flex items-center gap-2 text-sm">
            <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-xs text-muted-foreground">{label(l)}</span>
            <button className="truncate text-left hover:underline" onClick={() => select(l.other.id)}>
              {l.other.title}
            </button>
            {canWrite && (
              <button
                className="ml-auto text-muted-foreground hover:text-danger"
                aria-label={t("delete")}
                onClick={async () => {
                  await api.del(`/api/v1/links/${l.id}`);
                  onChange();
                }}
              >
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canWrite && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <select className={cn(selectCls, "w-36")} value={mode} aria-label={t("linkKind")} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="blocks">{t("blocks")}</option>
              <option value="blockedBy">{t("blockedBy")}</option>
              <option value="relates">{t("relates")}</option>
            </select>
            <select className={cn(selectCls, "min-w-0 flex-1")} value={target} aria-label={t("linkTarget")} onChange={(e) => setTarget(e.target.value)}>
              <option value="">—</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" disabled={!target} onClick={add}>
              {t("addLink")}
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

interface ActivityItem {
  id: string;
  action: string;
  diff: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string | null; email: string } | null;
}

function ActivitySection({ nodeId }: { nodeId: string }) {
  const t = useTranslations("drawer");
  const [open, setOpen] = useState(false);
  const { data = [] } = useQuery({ queryKey: ["activity", nodeId], enabled: open, queryFn: () => api.get<ActivityItem[]>(`/api/v1/nodes/${nodeId}/activity`) });
  return (
    <Section title={t("activity")}>
      <button className="self-start text-xs text-primary hover:underline" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? t("hide") : t("show")}
      </button>
      {open && (
        <ul className="flex flex-col gap-1.5 text-xs">
          {data.map((a) => (
            <li key={a.id} className="flex gap-2">
              <time className="shrink-0 text-muted-foreground" dateTime={a.createdAt}>
                {new Date(a.createdAt).toLocaleString()}
              </time>
              <span>
                <b>{a.actor?.name ?? a.actor?.email ?? "—"}</b> {a.action.replace(/[._]/g, " ")}
                {a.diff && a.action === "node.updated" && <> · {Object.keys(a.diff).join(", ")}</>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
