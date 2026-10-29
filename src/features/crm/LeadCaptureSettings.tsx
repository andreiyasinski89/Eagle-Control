"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, Modal, selectClass, textareaClass } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";
import { useMembers, usePipelines } from "./hooks";

const FIELD_KEYS = ["name", "email", "phone", "telegram", "company", "message", "amount"] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

interface FormDto {
  id: string;
  name: string;
  pipelineId: string;
  enabled: boolean;
  publicKey: string;
  config: {
    title: string;
    submitLabel: string;
    successMessage: string;
    consentText: string | null;
    redirectUrl: string | null;
    fields: { key: FieldKey; label: string; required: boolean }[];
    allowedOrigins: string[];
    ownerId: string | null;
    stageId: string | null;
  };
  embed: { url: string; iframe: string; html: string };
}
interface Ingest {
  id: string;
  source: string;
  status: string;
  error: string | null;
  createdAt: string;
}
interface Webhook {
  configured: boolean;
  url: string;
  pipelineId: string | null;
  ownerId: string | null;
}

const emptyConfig = (): FormDto["config"] => ({
  title: "Contact us",
  submitLabel: "Send",
  successMessage: "Thank you! We will get back to you shortly.",
  consentText: null,
  redirectUrl: null,
  fields: [
    { key: "name", label: "Name", required: true },
    { key: "email", label: "Email", required: true },
    { key: "message", label: "Message", required: false },
  ],
  allowedOrigins: [],
  ownerId: null,
  stageId: null,
});

function CopyBox({ label, value }: { label: string; value: string }) {
  const t = useTranslations("crm");
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <button
          className="inline-flex items-center gap-1 hover:text-foreground"
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Copy className="size-3" />
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <textarea readOnly className={`${textareaClass} min-h-16 font-mono text-xs`} value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
    </div>
  );
}

function FormEditor({ open, onClose, workspaceId, form, onSaved }: { open: boolean; onClose: () => void; workspaceId: string; form: FormDto | null; onSaved: () => void }) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const pipelines = usePipelines(workspaceId);
  const members = useMembers(workspaceId);
  const [name, setName] = useState(form?.name ?? "");
  const [pipelineId, setPipelineId] = useState(form?.pipelineId ?? "");
  const [cfg, setCfg] = useState(form?.config ?? emptyConfig());
  const [origins, setOrigins] = useState((form?.config.allowedOrigins ?? []).join("\n"));
  const [error, setError] = useState<string | null>(null);
  const pipeline = pipelines.data?.find((p) => p.id === (pipelineId || pipelines.data?.[0]?.id));

  const toggle = (key: FieldKey) => setCfg({ ...cfg, fields: cfg.fields.some((f) => f.key === key) ? cfg.fields.filter((f) => f.key !== key) : [...cfg.fields, { key, label: t(`formField.${key}`), required: false }] });
  const save = useMutation({
    mutationFn: () => {
      const body = { name, pipelineId: pipelineId || pipeline?.id, enabled: form?.enabled ?? true, config: { ...cfg, allowedOrigins: origins.split(/\s+/).filter(Boolean), consentText: cfg.consentText || null, redirectUrl: cfg.redirectUrl || null } };
      return form ? api.patch(`/api/v1/lead-forms/${form.id}`, body) : api.post(`/api/v1/workspaces/${workspaceId}/lead-forms`, body);
    },
    onSuccess: () => (onSaved(), onClose()),
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("error")),
  });

  return (
    <Modal open={open} onClose={onClose} title={form ? t("editForm") : t("newForm")} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label={t("formName")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </FormField>
        <FormField label={t("pipeline")}>
          <select className={selectClass} value={pipelineId || pipeline?.id || ""} onChange={(e) => setPipelineId(e.target.value)}>
            {pipelines.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t("startStage")}>
          <select className={selectClass} value={cfg.stageId ?? ""} onChange={(e) => setCfg({ ...cfg, stageId: e.target.value || null })}>
            <option value="">{t("firstStage")}</option>
            {pipeline?.stages.filter((s) => !s.isWon && !s.isLost).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t("owner")}>
          <select className={selectClass} value={cfg.ownerId ?? ""} onChange={(e) => setCfg({ ...cfg, ownerId: e.target.value || null })}>
            <option value="">{t("workspaceOwner")}</option>
            {members.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t("formTitle")}>
          <Input value={cfg.title} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} />
        </FormField>
        <FormField label={t("submitLabel")}>
          <Input value={cfg.submitLabel} onChange={(e) => setCfg({ ...cfg, submitLabel: e.target.value })} />
        </FormField>
      </div>
      <fieldset className="flex flex-wrap gap-x-5 gap-y-2">
        <legend className="mb-1 text-sm font-medium">{t("formFields")}</legend>
        {FIELD_KEYS.map((k) => {
          const f = cfg.fields.find((x) => x.key === k);
          return (
            <span key={k} className="flex items-center gap-2 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={!!f} onChange={() => toggle(k)} />
                {t(`formField.${k}`)}
              </label>
              {f && (
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="checkbox" checked={f.required} onChange={(e) => setCfg({ ...cfg, fields: cfg.fields.map((x) => (x.key === k ? { ...x, required: e.target.checked } : x)) })} />
                  {t("required")}
                </label>
              )}
            </span>
          );
        })}
      </fieldset>
      <FormField label={t("successMessage")}>
        <Input value={cfg.successMessage} onChange={(e) => setCfg({ ...cfg, successMessage: e.target.value })} />
      </FormField>
      <FormField label={t("consentText")} hint={t("consentTextHint")}>
        <Input value={cfg.consentText ?? ""} onChange={(e) => setCfg({ ...cfg, consentText: e.target.value })} />
      </FormField>
      <FormField label={t("redirectUrl")}>
        <Input type="url" value={cfg.redirectUrl ?? ""} onChange={(e) => setCfg({ ...cfg, redirectUrl: e.target.value })} placeholder="https://" />
      </FormField>
      <FormField label={t("allowedOrigins")} hint={t("allowedOriginsHint")}>
        <textarea className={textareaClass} value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder="https://example.com" />
      </FormField>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button disabled={!name.trim() || cfg.fields.length === 0 || save.isPending} onClick={() => save.mutate()}>
          {tc("save")}
        </Button>
      </div>
    </Modal>
  );
}

export function LeadCaptureSettings({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  const qc = useQueryClient();
  const pipelines = usePipelines(workspaceId);
  const [editing, setEditing] = useState<FormDto | "new" | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const forms = useQuery({ queryKey: ["lead-forms", workspaceId], queryFn: () => api.get<FormDto[]>(`/api/v1/workspaces/${workspaceId}/lead-forms`) });
  const hook = useQuery({ queryKey: ["lead-webhook", workspaceId], queryFn: () => api.get<Webhook>(`/api/v1/workspaces/${workspaceId}/lead-webhook`) });
  const log = useQuery({ queryKey: ["lead-ingests", workspaceId], queryFn: () => api.get<Ingest[]>(`/api/v1/workspaces/${workspaceId}/lead-ingests`) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["lead-forms", workspaceId] });
  const fail = (e: unknown) => setError(e instanceof ApiFailure ? e.message : t("error"));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t("leadCapture")}</h1>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("webForms")}</h2>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            {t("newForm")}
          </Button>
        </div>
        {forms.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("noForms")}</p>}
        <ul className="flex flex-col gap-4">
          {forms.data?.map((f) => (
            <li key={f.id} className="rounded-md border border-border p-3" data-testid={`form-${f.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{f.name}</span>
                <span className="text-xs text-muted-foreground">{pipelines.data?.find((p) => p.id === f.pipelineId)?.name}</span>
                <label className="ml-auto flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={f.enabled} onChange={(e) => api.patch(`/api/v1/lead-forms/${f.id}`, { enabled: e.target.checked }).then(refresh).catch(fail)} />
                  {t("enabled")}
                </label>
                <Button size="sm" variant="outline" onClick={() => setEditing(f)}>
                  {t("edit")}
                </Button>
                <Button size="sm" variant="danger" onClick={() => window.confirm(t("deleteFormConfirm")) && api.del(`/api/v1/lead-forms/${f.id}`).then(refresh).catch(fail)}>
                  {t("delete")}
                </Button>
              </div>
              <div className="mt-2 flex flex-col gap-2">
                <CopyBox label={t("hostedLink")} value={f.embed.url} />
                <CopyBox label={t("embedIframe")} value={f.embed.iframe} />
                <CopyBox label={t("embedHtml")} value={f.embed.html} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-base font-semibold">{t("webhook")}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t("webhookHint")}</p>
        {hook.data && <CopyBox label="POST" value={hook.data.url} />}
        {token ? (
          <div className="mt-3 rounded-md bg-[var(--health-yellow)]/15 p-3 text-sm" role="status">
            <p className="mb-1 font-medium">{t("tokenOnce")}</p>
            <CopyBox label="Authorization: Bearer" value={token} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">{hook.data?.configured ? t("tokenExists") : t("tokenNone")}</p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <select className={`${selectClass} w-52`} aria-label={t("pipeline")} defaultValue={hook.data?.pipelineId ?? ""} key={hook.data?.pipelineId ?? "none"} id="hook-pipeline">
            <option value="">{t("defaultPipeline")}</option>
            {pipelines.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant={hook.data?.configured ? "outline" : "primary"}
            onClick={() => {
              if (hook.data?.configured && !window.confirm(t("rotateConfirm"))) return;
              const sel = (document.getElementById("hook-pipeline") as HTMLSelectElement | null)?.value || null;
              api.post<{ token: string }>(`/api/v1/workspaces/${workspaceId}/lead-webhook`, { pipelineId: sel }).then((r) => (setToken(r.token), void qc.invalidateQueries({ queryKey: ["lead-webhook", workspaceId] }))).catch(fail);
            }}
          >
            {hook.data?.configured ? t("rotateToken") : t("createToken")}
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-base font-semibold">{t("incomingLeads")}</h2>
        {log.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("noLeadsYet")}</p>}
        <table className="w-full text-xs">
          <tbody>
            {log.data?.map((i) => (
              <tr key={i.id} className="border-t border-border">
                <td className="py-1 text-muted-foreground">{new Date(i.createdAt).toLocaleString(locale)}</td>
                <td className="py-1">{i.source}</td>
                <td className={i.status === "rejected" ? "py-1 text-[var(--health-red)]" : "py-1"}>{t(`ingest.${i.status}`)}</td>
                <td className="py-1 text-muted-foreground">{i.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {editing && <FormEditor key={editing === "new" ? "new" : editing.id} open workspaceId={workspaceId} form={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}
