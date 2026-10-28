"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FormField, Modal, selectClass, textareaClass } from "@/components/ui/modal";
import { ApiFailure, api } from "@/features/mindmap/api";
import { buildEvent, defaultTimes, type EventForm } from "@/modules/views/new-event";
import { zoneLabel } from "@/modules/views/tz";
import { RepeatFields } from "./RepeatFields";
import { useTimeZone } from "./useTimeZone";

const inputClass = "h-9 w-full rounded-md border border-border bg-card px-2 text-sm";
const LAST_PROJECT = "meetowl:lastEventProject";

const remembered = (): string | null => {
  try {
    return localStorage.getItem(LAST_PROJECT);
  } catch {
    return null;
  }
};
const remember = (id: string) => {
  try {
    localStorage.setItem(LAST_PROJECT, id);
  } catch {
    /* the choice is only a convenience */
  }
};

/** Adds a meeting from the calendar: where and when come from the click, the project is picked here. */
export function NewEventDialog({ open, onClose, workspaceId, day, time }: { open: boolean; onClose: () => void; workspaceId: string; day: string; time?: string }) {
  const t = useTranslations("views");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const { tz, userId } = useTimeZone();
  const [form, setForm] = useState<EventForm>(() => ({ title: "", day, allDay: false, ...defaultTimes(time, new Date(), tz), location: "", meetingUrl: "", agenda: "", addMeet: false, attendeeId: null, repeat: "NONE", repeatUntil: "" }));
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const projects = useQuery({ queryKey: ["projects", workspaceId], enabled: open, queryFn: () => api.get<{ id: string; title: string }[]>(`/api/v1/workspaces/${workspaceId}/projects`) });

  // A fresh form for every opening: the clicked day and time, nothing left over from the last meeting.
  useEffect(() => {
    if (!open) return;
    setForm({ title: "", day, allDay: false, ...defaultTimes(time, new Date(), tz), location: "", meetingUrl: "", agenda: "", addMeet: false, attendeeId: null, repeat: "NONE", repeatUntil: "" });
    setError(null);
  }, [open, day, time, tz]);

  useEffect(() => {
    const list = projects.data;
    if (!open || !list || list.length === 0) return;
    setProjectId((cur) => (list.some((p) => p.id === cur) ? cur : (list.find((p) => p.id === remembered()) ?? (list[0] as { id: string })).id));
  }, [open, projects.data]);

  const set = <K extends keyof EventForm>(k: K, v: EventForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const createProject = useMutation({
    mutationFn: () => api.post<{ project: { id: string } }>(`/api/v1/workspaces/${workspaceId}/projects`, { name: t("defaultProject") }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["projects", workspaceId] });
      setProjectId(r.project.id);
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("error")),
  });

  const create = useMutation({
    mutationFn: (body: { title: string; data: unknown }) => api.post("/api/v1/nodes", { parentId: projectId, type: "EVENT", title: body.title, data: body.data }),
    onSuccess: async () => {
      remember(projectId);
      await qc.invalidateQueries({ queryKey: ["calendar"] });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("error")),
  });

  function submit() {
    setError(null);
    const built = buildEvent({ ...form, attendeeId: userId }, tz);
    if (!built.ok) return setError(t(`eventProblem.${built.problem}`));
    if (!projectId) return setError(t("eventProblem.project"));
    create.mutate({ title: built.title, data: built.data });
  }

  const noProjects = projects.isSuccess && projects.data.length === 0;

  return (
    <Modal open={open} onClose={onClose} title={t("newEvent")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <FormField label={t("eventTitle")}>
          <input className={inputClass} value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={200} autoFocus required placeholder={t("eventTitlePlaceholder")} />
        </FormField>

        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label={t("eventDay")}>
            <input type="date" className={inputClass} value={form.day} onChange={(e) => set("day", e.target.value)} required />
          </FormField>
          <FormField label={t("eventStart")}>
            <input type="time" className={inputClass} value={form.start} disabled={form.allDay} onChange={(e) => set("start", e.target.value)} />
          </FormField>
          <FormField label={t("eventEnd")}>
            <input type="time" className={inputClass} value={form.end} disabled={form.allDay} onChange={(e) => set("end", e.target.value)} />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.allDay} onChange={(e) => set("allDay", e.target.checked)} />
          {t("eventAllDay")}
        </label>
        <p className="-mt-2 text-xs text-muted-foreground">{t("eventZoneHint", { zone: zoneLabel(tz) })}</p>
        <RepeatFields preset={form.repeat ?? "NONE"} until={form.repeatUntil ?? ""} minDay={form.day} onPreset={(p) => set("repeat", p)} onUntil={(d) => set("repeatUntil", d)} />

        <FormField label={t("eventProject")} hint={t("eventProjectHint")}>
          {noProjects ? (
            <Button type="button" variant="outline" disabled={createProject.isPending} onClick={() => createProject.mutate()}>
              {t("eventCreateProject", { name: t("defaultProject") })}
            </Button>
          ) : (
            <select className={selectClass} value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!projects.isSuccess}>
              {(projects.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField label={t("eventLocation")}>
          <input className={inputClass} value={form.location} onChange={(e) => set("location", e.target.value)} maxLength={300} />
        </FormField>
        <FormField label={t("eventLink")}>
          <input className={inputClass} value={form.meetingUrl} onChange={(e) => set("meetingUrl", e.target.value)} placeholder="https://" inputMode="url" />
        </FormField>
        {!form.meetingUrl.trim() && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.addMeet} onChange={(e) => set("addMeet", e.target.checked)} />
            {t("eventAddMeet")}
          </label>
        )}
        <FormField label={t("eventAgenda")}>
          <textarea className={textareaClass} value={form.agenda} onChange={(e) => set("agenda", e.target.value)} maxLength={5000} />
        </FormField>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="submit" disabled={create.isPending || projects.isLoading}>
            {t("eventSave")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
