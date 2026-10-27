"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, Modal, selectClass, textareaClass } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";
import { STAGES, type Stage } from "@/modules/crm/people";
import { useScripts, type ScriptDto } from "./useScripts";

interface Rule {
  stage: Stage;
  nextStep: string;
  afterDays: number;
}

/**
 * Two things the team keeps here: the **scripts** (a ready text for each moment of the funnel, copied into a messenger with the name filled in)
 * and the **auto-plans** (what the next step is, and in how many days, when a person moves into a stage).
 */
export function ScriptsView({ workspaceId, canWrite }: { workspaceId: string; canWrite: boolean }) {
  const t = useTranslations("crm");
  const scripts = useScripts(workspaceId);
  const [editing, setEditing] = useState<ScriptDto | "new" | null>(null);
  const groups: (Stage | "any")[] = [...STAGES, "any"];
  const of = (g: Stage | "any") => (scripts.data ?? []).filter((s) => (g === "any" ? s.stage === null : s.stage === g));

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4" data-testid="scripts-view">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{t("scriptsTitle")}</h1>
          {canWrite && (
            <Button size="sm" className="ml-auto" onClick={() => setEditing("new")} data-testid="new-script">
              <Plus className="size-4" />
              {t("newScript")}
            </Button>
          )}
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("scriptsHint")}</p>
        {scripts.data && scripts.data.length === 0 && <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">{t("scriptsEmpty")}</p>}
        {groups.map((g) =>
          of(g).length === 0 ? null : (
            <div key={g} className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g === "any" ? t("scriptAnyStage") : t(`funnelStage.${g}`)}</h2>
              <ul className="grid gap-2 md:grid-cols-2">
                {of(g).map((s) => (
                  <li key={s.id} className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 text-sm" data-testid="script-card">
                    <div className="flex items-start gap-2">
                      <span className="min-w-0 flex-1 font-medium">{s.title}</span>
                      {canWrite && (
                        <button type="button" aria-label={t("editScript")} title={t("editScript")} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setEditing(s)}>
                          <Pencil className="size-4" />
                        </button>
                      )}
                    </div>
                    <p className="line-clamp-4 whitespace-pre-line text-xs text-muted-foreground">{s.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </section>

      <AutoPlans workspaceId={workspaceId} canWrite={canWrite} />
      {editing && <ScriptDialog workspaceId={workspaceId} script={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ScriptDialog({ workspaceId, script, onClose }: { workspaceId: string; script: ScriptDto | null; onClose: () => void }) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const [title, setTitle] = useState(script?.title ?? "");
  const [stage, setStage] = useState<string>(script?.stage ?? "");
  const [body, setBody] = useState(script?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["scripts", workspaceId] });
    onClose();
  };
  const fail = (e: unknown) => setError(e instanceof ApiFailure && e.code === "script_limit" ? t("scriptLimit") : t("error"));
  const save = useMutation({
    mutationFn: () => {
      const data = { title: title.trim(), stage: stage || null, body: body.trim() };
      return script ? api.patch(`/api/v1/scripts/${script.id}`, data) : api.post(`/api/v1/workspaces/${workspaceId}/scripts`, data);
    },
    onSuccess: done,
    onError: fail,
  });
  const remove = useMutation({ mutationFn: () => api.del(`/api/v1/scripts/${script?.id}`), onSuccess: done, onError: fail });

  return (
    <Modal open onClose={onClose} title={script ? t("editScript") : t("newScript")} wide>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim() && body.trim()) save.mutate();
        }}
      >
        <FormField label={t("scriptTitle")}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus data-testid="script-title" />
        </FormField>
        <FormField label={t("scriptStage")}>
          <select className={selectClass} value={stage} onChange={(e) => setStage(e.target.value)} data-testid="script-stage">
            <option value="">{t("scriptAnyStage")}</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {t(`funnelStage.${s}`)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label={t("scriptBody")} hint={t("scriptBodyHint")}>
          <textarea className={`${textareaClass} min-h-48`} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} data-testid="script-body" />
        </FormField>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          {script ? (
            <Button type="button" variant="danger" size="sm" disabled={remove.isPending} onClick={() => window.confirm(t("deleteScriptConfirm")) && remove.mutate()}>
              {t("deleteScript")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={save.isPending || !title.trim() || !body.trim()} data-testid="script-save">
              {tc("save")}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function AutoPlans({ workspaceId, canWrite }: { workspaceId: string; canWrite: boolean }) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["stage-rules", workspaceId], queryFn: () => api.get<{ rules: Rule[] }>(`/api/v1/workspaces/${workspaceId}/stage-rules`) });
  const [rows, setRows] = useState<Record<string, { text: string; days: number }>>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!data) return;
    setRows(Object.fromEntries(data.rules.map((r) => [r.stage, { text: r.nextStep, days: r.afterDays }])));
  }, [data]);

  const stages = STAGES.filter((s) => s !== "NEW");
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/workspaces/${workspaceId}/stage-rules`, { rules: stages.map((s) => ({ stage: s, nextStep: (rows[s]?.text ?? "").trim(), afterDays: rows[s]?.days ?? 1 })) }),
    onSuccess: () => {
      setSaved(true);
      void qc.invalidateQueries({ queryKey: ["stage-rules", workspaceId] });
    },
  });
  const defaults = () => {
    const d: Record<string, { text: string; days: number }> = {};
    for (const [s, days] of [["FIRST_CONTACT", 2], ["WARMING", 3], ["PRESENTATION", 1], ["DECIDING", 2], ["CLIENT", 3], ["PARTNER", 1]] as const) d[s] = { text: t(`autoDefault.${s}`), days };
    setRows(d);
    setSaved(false);
  };

  return (
    <section className="flex flex-col gap-3" data-testid="auto-plans">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">{t("autoPlanTitle")}</h2>
        {canWrite && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={defaults} data-testid="auto-defaults">
            {t("autoFill")}
          </Button>
        )}
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">{t("autoPlanHint")}</p>
      <ul className="flex flex-col gap-2">
        {stages.map((s) => (
          <li key={s} className="grid items-center gap-2 sm:grid-cols-[10rem_1fr_7rem]" data-testid="auto-row" data-stage={s}>
            <span className="text-sm font-medium">{t(`funnelStage.${s}`)}</span>
            <Input disabled={!canWrite} value={rows[s]?.text ?? ""} maxLength={200} placeholder={t("autoNone")} aria-label={t("autoStep", { stage: t(`funnelStage.${s}`) })} onChange={(e) => (setSaved(false), setRows((r) => ({ ...r, [s]: { text: e.target.value, days: r[s]?.days ?? 1 } })))} />
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span>{t("autoAfter")}</span>
              <Input type="number" min={0} max={365} disabled={!canWrite} className="w-16" value={rows[s]?.days ?? 1} aria-label={t("autoDays", { stage: t(`funnelStage.${s}`) })} onChange={(e) => (setSaved(false), setRows((r) => ({ ...r, [s]: { text: r[s]?.text ?? "", days: Math.max(0, Math.min(365, Number(e.target.value) || 0)) } })))} />
              <span>{t("autoDaysShort")}</span>
            </label>
          </li>
        ))}
      </ul>
      {canWrite && (
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} data-testid="auto-save">
            {tc("save")}
          </Button>
          {saved && <span className="text-sm text-muted-foreground">{t("autoSaved")}</span>}
        </div>
      )}
    </section>
  );
}
