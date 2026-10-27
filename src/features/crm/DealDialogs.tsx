"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, Modal, selectClass, textareaClass } from "@/components/ui/modal";
import { Link } from "@/i18n/navigation";
import { api, ApiFailure } from "@/features/mindmap/api";
import { useTimeZone } from "@/features/views/useTimeZone";
import { zonedToUtc } from "@/modules/views/tz";
import { dayToIso } from "./format";
import { useCompanyOptions, useContactOptions, useLostReasons, useMembers, useTemplates } from "./hooks";
import type { ActivityDto, DealDetailDto, PipelineDto } from "./types";

function useAction() {
  const t = useTranslations("crm");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof ApiFailure ? (e.code === "plan_limit" ? t("planLimit") : e.message) : t("error"));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}

const Err = ({ msg }: { msg: string | null }) =>
  msg ? (
    <p role="alert" className="text-sm text-danger">
      {msg}
    </p>
  ) : null;

// ── new deal ────────────────────────────────────────────────────────────────

export function NewDealDialog({ open, onClose, workspaceId, pipeline, defaultCompanyId, onCreated }: { open: boolean; onClose: () => void; workspaceId: string; pipeline: PipelineDto | undefined; defaultCompanyId?: string; onCreated: (id: string) => void }) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const { busy, error, run } = useAction();
  const members = useMembers(workspaceId);
  const [f, setF] = useState({ title: "", amount: "", currency: "EUR", companyId: defaultCompanyId ?? "", contactId: "", ownerId: "", expected: "", nextStep: "", stageId: "" });
  const companies = useCompanyOptions(workspaceId);
  const contacts = useContactOptions(workspaceId, f.companyId || undefined);
  const openStages = pipeline?.stages.filter((s) => !s.isWon && !s.isLost) ?? [];

  return (
    <Modal open={open} onClose={onClose} title={t("newDeal")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(async () => {
            const d = await api.post<{ id: string }>(`/api/v1/workspaces/${workspaceId}/deals`, {
              title: f.title,
              amount: f.amount ? Number(f.amount) : 0,
              currency: f.currency,
              pipelineId: pipeline?.id,
              stageId: f.stageId || undefined,
              companyId: f.companyId || null,
              primaryContactId: f.contactId || null,
              ownerId: f.ownerId || undefined,
              expectedCloseDate: dayToIso(f.expected),
              nextStep: f.nextStep || null,
            });
            await qc.invalidateQueries({ queryKey: ["board"] });
            onCreated(d.id);
          });
          if (ok) onClose();
        }}
      >
        <FormField label={t("dealTitle")}>
          <Input required maxLength={200} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus />
        </FormField>
        <div className="grid grid-cols-[1fr_100px] gap-3">
          <FormField label={t("amount")}>
            <Input type="number" min={0} step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </FormField>
          <FormField label={t("currency")}>
            <Input maxLength={3} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value.toUpperCase() })} />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t("company")}>
            <select className={selectClass} value={f.companyId} onChange={(e) => setF({ ...f, companyId: e.target.value, contactId: "" })}>
              <option value="">—</option>
              {companies.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legalName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t("contact")}>
            <select className={selectClass} value={f.contactId} onChange={(e) => setF({ ...f, contactId: e.target.value })}>
              <option value="">—</option>
              {contacts.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t("stage")}>
            <select className={selectClass} value={f.stageId} onChange={(e) => setF({ ...f, stageId: e.target.value })}>
              <option value="">{openStages[0]?.name}</option>
              {openStages.slice(1).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={t("owner")}>
            <select className={selectClass} value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>
              <option value="">{t("me")}</option>
              {members.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label={t("expectedClose")}>
          <Input type="date" value={f.expected} onChange={(e) => setF({ ...f, expected: e.target.value })} />
        </FormField>
        <FormField label={t("nextStep")} hint={t("nextStepHint")}>
          <Input maxLength={300} value={f.nextStep} onChange={(e) => setF({ ...f, nextStep: e.target.value })} />
        </FormField>
        <Err msg={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="submit" disabled={busy || !f.title.trim()}>
            {t("createDeal")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── lose ────────────────────────────────────────────────────────────────────

export function LoseDialog({ open, onClose, workspaceId, onConfirm }: { open: boolean; onClose: () => void; workspaceId: string; onConfirm: (reasonId: string) => Promise<void> }) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const reasons = useLostReasons(workspaceId);
  const { busy, error, run } = useAction();
  const [reasonId, setReasonId] = useState("");
  return (
    <Modal open={open} onClose={onClose} title={t("markLost")}>
      <FormField label={t("lostReason")} hint={t("lostReasonHint")}>
        <select className={selectClass} value={reasonId} onChange={(e) => setReasonId(e.target.value)} autoFocus>
          <option value="">—</option>
          {reasons.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </FormField>
      <Err msg={error} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button
          variant="danger"
          disabled={!reasonId || busy}
          onClick={async () => {
            if (await run(() => onConfirm(reasonId))) {
              setReasonId("");
              onClose();
            }
          }}
        >
          {t("markLost")}
        </Button>
      </div>
    </Modal>
  );
}

// ── won → project ───────────────────────────────────────────────────────────

export function WinProjectDialog({ open, onClose, workspaceId, slug, deal, onCreated }: { open: boolean; onClose: () => void; workspaceId: string; slug: string; deal: { id: string; title: string } | null; onCreated?: () => void }) {
  const t = useTranslations("crm");
  const tp = useTranslations("projects");
  const qc = useQueryClient();
  const templates = useTemplates(workspaceId);
  const { busy, error, run } = useAction();
  const [name, setName] = useState("");
  const [tpl, setTpl] = useState("builtin:agile-sprint-map");
  const [start, setStart] = useState("");
  const [created, setCreated] = useState<{ id: string; title: string } | null>(null);

  if (!deal) return null;
  const submit = async () => {
    await run(async () => {
      const isCustom = tpl.startsWith("custom:");
      const res = await api.post<{ project: { id: string; title: string } }>(`/api/v1/deals/${deal.id}/create-project`, {
        name: name || undefined,
        startDate: start ? dayToIso(start) : undefined,
        ...(isCustom ? { templateId: tpl.slice(7) } : { template: tpl.slice(8) }),
      });
      setCreated(res.project);
      await qc.invalidateQueries({ queryKey: ["deal", deal.id] });
      await qc.invalidateQueries({ queryKey: ["board"] });
      onCreated?.();
    });
  };
  return (
    <Modal open={open} onClose={() => { setCreated(null); onClose(); }} title={created ? t("projectCreated") : t("createProjectTitle")}>
      {created ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">{t("projectCreatedBody", { name: created.title })}</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setCreated(null); onClose(); }}>
              {t("close")}
            </Button>
            <Button asChild>
              <Link href={`/w/${slug}/projects/p/${created.id}`}>{t("openProject")}</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{t("wonPrompt")}</p>
          <FormField label={t("projectName")}>
            <Input value={name} placeholder={deal.title} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label={tp("template")}>
            <select className={selectClass} value={tpl} onChange={(e) => setTpl(e.target.value)}>
              {templates.data?.builtIn.map((b) => (
                <option key={b.key} value={`builtin:${b.key}`}>
                  {tp(`tpl.${b.key}`)}
                </option>
              ))}
              {templates.data?.custom.map((c) => (
                <option key={c.id} value={`custom:${c.id}`}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label={tp("start")} hint={t("startHint")}>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </FormField>
          <Err msg={error} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t("notNow")}
            </Button>
            <Button disabled={busy} onClick={submit}>
              {t("createProject")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── log activity ────────────────────────────────────────────────────────────

const TYPES = ["CALL", "EMAIL", "MEETING", "NOTE", "MESSAGE", "TASK"] as const;

export function ActivityDialog({ open, onClose, workspaceId, defaults, onSaved }: { open: boolean; onClose: () => void; workspaceId: string; defaults: { type?: ActivityDto["type"]; dealId?: string | null; contactId?: string | null; companyId?: string | null; schedule?: boolean }; onSaved?: () => void }) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const { busy, error, run } = useAction();
  const { tz } = useTimeZone();
  const [f, setF] = useState({ type: defaults.type ?? "CALL", subject: "", body: "", due: "" });
  const scheduling = defaults.schedule || f.type === "TASK";
  return (
    <Modal open={open} onClose={onClose} title={defaults.schedule ? t("scheduleMeeting") : t("logActivity")}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(async () => {
            await api.post(`/api/v1/workspaces/${workspaceId}/activities`, {
              type: defaults.schedule ? "MEETING" : f.type,
              subject: f.subject,
              body: f.body || null,
              dueAt: f.due ? zonedToUtc(f.due.slice(0, 10), f.due.slice(11, 16), tz).toISOString() : null,
              dealId: defaults.dealId ?? null,
              contactId: defaults.contactId ?? null,
              companyId: defaults.companyId ?? null,
            });
            await Promise.all([qc.invalidateQueries({ queryKey: ["deal"] }), qc.invalidateQueries({ queryKey: ["board"] }), qc.invalidateQueries({ queryKey: ["activities"] }), qc.invalidateQueries({ queryKey: ["contact"] })]);
            onSaved?.();
          });
          if (ok) {
            setF({ type: defaults.type ?? "CALL", subject: "", body: "", due: "" });
            onClose();
          }
        }}
      >
        {!defaults.schedule && (
          <FormField label={t("activityType")}>
            <select className={selectClass} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as ActivityDto["type"] })}>
              {TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`activity.${x}`)}
                </option>
              ))}
            </select>
          </FormField>
        )}
        <FormField label={t("subject")}>
          <Input required maxLength={200} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} autoFocus />
        </FormField>
        <FormField label={t("details")}>
          <textarea className={textareaClass} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </FormField>
        <FormField label={scheduling ? t("dueAt") : t("whenOptional")}>
          <Input type="datetime-local" value={f.due} required={scheduling} onChange={(e) => setF({ ...f, due: e.target.value })} />
        </FormField>
        <Err msg={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="submit" disabled={busy || !f.subject.trim()}>
            {tc("save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export type { DealDetailDto };
