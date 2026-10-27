"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Phone, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, Modal, selectClass, textareaClass } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";
import { useTimeZone } from "@/features/views/useTimeZone";
import { buildScheduled, DURATIONS, defaultSlot, type ScheduleForm, type ScheduleKind } from "@/modules/crm/schedule";
import { zoneLabel } from "@/modules/views/tz";
import { cn } from "@/lib/utils";

const empty = (kind: ScheduleKind, subject: string, tz: string): ScheduleForm => ({ kind, subject, ...defaultSlot(new Date(), tz), durationMin: kind === "CALL" ? 30 : 60, body: "" });

/**
 * Plans a call or a meeting with a contact: it becomes an open CRM activity with a date, a time and a length,
 * which the workspace calendar draws at once, in each person's own time zone.
 */
export function ScheduleDialog({ open, onClose, workspaceId, contactId, companyId, contactName, onSaved }: { open: boolean; onClose: () => void; workspaceId: string; contactId: string; companyId: string | null; contactName: string; onSaved?: (when: { day: string }) => void }) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const { tz } = useTimeZone();
  const subjectFor = (kind: ScheduleKind) => t(kind === "CALL" ? "planDefaultCall" : "planDefaultMeeting", { name: contactName });
  const [f, setF] = useState<ScheduleForm>(() => empty("CALL", subjectFor("CALL"), tz));
  /** Once the person types their own title, switching Call/Meeting stops rewriting it. */
  const [titled, setTitled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setF(empty("CALL", subjectFor("CALL"), tz));
    setTitled(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a fresh form per opening
  }, [open, tz, contactName]);

  const save = useMutation({
    mutationFn: (input: object) => api.post(`/api/v1/workspaces/${workspaceId}/activities`, { ...input, contactId, companyId }),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["calendar"] }), qc.invalidateQueries({ queryKey: ["activities"] }), qc.invalidateQueries({ queryKey: ["contact", contactId] }), qc.invalidateQueries({ queryKey: ["my-day"] })]);
      onSaved?.({ day: f.day });
      onClose();
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("error")),
  });

  const pick = (kind: ScheduleKind) => setF((cur) => ({ ...cur, kind, durationMin: cur.durationMin === (cur.kind === "CALL" ? 30 : 60) ? (kind === "CALL" ? 30 : 60) : cur.durationMin, subject: titled ? cur.subject : subjectFor(kind) }));

  return (
    <Modal open={open} onClose={onClose} title={t("planContact")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const built = buildScheduled(f, tz);
          if (!built.ok) return setError(t(`planProblem.${built.problem}`));
          save.mutate(built.input);
        }}
      >
        <div role="radiogroup" aria-label={t("planKind")} className="grid grid-cols-2 gap-2">
          {(["CALL", "MEETING"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={f.kind === k}
              onClick={() => pick(k)}
              className={cn("flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm", f.kind === k ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground hover:bg-muted")}
            >
              {k === "CALL" ? <Phone className="size-4" /> : <Users className="size-4" />}
              {t(k === "CALL" ? "planKindCall" : "planKindMeeting")}
            </button>
          ))}
        </div>

        <FormField label={t("subject")}>
          <Input
            required
            maxLength={200}
            value={f.subject}
            onChange={(e) => {
              setTitled(true);
              setF({ ...f, subject: e.target.value });
            }}
          />
        </FormField>

        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label={t("planDay")}>
            <Input type="date" required value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} />
          </FormField>
          <FormField label={t("planTime")}>
            <Input type="time" required value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
          </FormField>
          <FormField label={t("planDuration")}>
            <select className={selectClass} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })}>
              {DURATIONS.map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? t("planMinutes", { n: m }) : t("planHours", { n: m / 60 })}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <p className="-mt-1 text-xs text-muted-foreground">{t("planZoneHint", { zone: zoneLabel(tz) })}</p>

        <FormField label={t("planNotes")}>
          <textarea className={textareaClass} maxLength={10000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </FormField>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t("planCalendarHint")}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            <CalendarPlus className="size-4" />
            {t("planSave")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
