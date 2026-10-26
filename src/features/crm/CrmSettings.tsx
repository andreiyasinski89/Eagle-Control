"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";
import { useLostReasons, usePipelines, useTemplates } from "./hooks";
import type { PipelineDto } from "./types";

interface StageRow {
  id?: string;
  name: string;
  probability: number;
  isWon: boolean;
  isLost: boolean;
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="mb-3 text-sm text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}

function StageEditor({ pipeline, workspaceId, onSaved }: { pipeline: PipelineDto; workspaceId: string; onSaved: () => void }) {
  const t = useTranslations("crm");
  const [rows, setRows] = useState<StageRow[]>([]);
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [needMove, setNeedMove] = useState<{ stageId: string; name: string } | null>(null);

  useEffect(() => {
    setRows(pipeline.stages.map((s) => ({ id: s.id, name: s.name, probability: s.probability, isWon: s.isWon, isLost: s.isLost })));
    setMoveTo({});
    setNeedMove(null);
    setError(null);
  }, [pipeline]);

  const open = rows.filter((r) => !r.isWon && !r.isLost);
  const won = rows.find((r) => r.isWon);
  const lost = rows.find((r) => r.isLost);
  const setOpen = (next: StageRow[]) => setRows([...next, ...(won ? [won] : []), ...(lost ? [lost] : [])]);
  const swap = (i: number, j: number) => {
    const next = [...open];
    [next[i], next[j]] = [next[j] as StageRow, next[i] as StageRow];
    setOpen(next);
  };

  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/pipelines/${pipeline.id}/stages`, { stages: rows, moveDealsTo: moveTo }),
    onSuccess: () => (setError(null), setNeedMove(null), onSaved()),
    onError: (e) => {
      if (e instanceof ApiFailure && e.code === "stage_has_deals") {
        const id = (e.details as { stageId?: string } | undefined)?.stageId;
        const row = pipeline.stages.find((s) => s.id === id);
        setNeedMove({ stageId: id ?? "", name: row?.name ?? "" });
        setError(t("stageHasDeals", { name: row?.name ?? "" }));
      } else setError(e instanceof ApiFailure ? e.message : t("error"));
    },
  });
  void workspaceId;

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2" aria-label={t("stages")}>
        {open.map((r, i) => (
          <li key={r.id ?? `new${i}`} className="flex items-center gap-2">
            <Input aria-label={t("stageName")} className="max-w-56" value={r.name} onChange={(e) => setOpen(open.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
            <Input aria-label={t("probability")} type="number" min={0} max={100} className="w-20" value={r.probability} onChange={(e) => setOpen(open.map((x, k) => (k === i ? { ...x, probability: Math.min(100, Math.max(0, Number(e.target.value) || 0)) } : x)))} />
            <span className="text-xs text-muted-foreground">%</span>
            <Button size="sm" variant="ghost" aria-label={t("moveUp")} disabled={i === 0} onClick={() => swap(i, i - 1)}>
              <ArrowUp className="size-4" />
            </Button>
            <Button size="sm" variant="ghost" aria-label={t("moveDown")} disabled={i === open.length - 1} onClick={() => swap(i, i + 1)}>
              <ArrowDown className="size-4" />
            </Button>
            <Button size="sm" variant="ghost" aria-label={t("removeStage")} disabled={open.length <= 1} onClick={() => setOpen(open.filter((_, k) => k !== i))}>
              <Trash2 className="size-4" />
            </Button>
            {needMove?.stageId === r.id && (
              <select className={`${selectClass} w-48`} aria-label={t("moveDealsTo")} value={moveTo[r.id ?? ""] ?? ""} onChange={(e) => setMoveTo({ ...moveTo, [r.id ?? ""]: e.target.value })}>
                <option value="">{t("moveDealsTo")}…</option>
                {open.filter((x) => x.id && x.id !== r.id).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
        {[won, lost].map(
          (r) =>
            r && (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <Input aria-label={t("stageName")} className="max-w-56" value={r.name} onChange={(e) => setRows(rows.map((x) => (x === r ? { ...x, name: e.target.value } : x)))} />
                <span className="rounded bg-muted px-2 py-1 text-xs">{r.isWon ? t("won") : t("lost")}</span>
              </li>
            ),
        )}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen([...open, { name: t("newStage"), probability: 50, isWon: false, isLost: false }])}>
          <Plus className="size-4" />
          {t("addStage")}
        </Button>
        <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          {t("saveStages")}
        </Button>
      </div>
    </div>
  );
}

export function CrmSettings({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("crm");
  const qc = useQueryClient();
  const pipelines = usePipelines(workspaceId);
  const reasons = useLostReasons(workspaceId);
  const templates = useTemplates(workspaceId);
  const [selected, setSelected] = useState<string | null>(null);
  const [newPipeline, setNewPipeline] = useState("");
  const [reason, setReason] = useState("");
  const [fromProject, setFromProject] = useState({ id: "", name: "" });
  const [error, setError] = useState<string | null>(null);
  const projects = useQuery({ queryKey: ["projects", workspaceId], queryFn: () => api.get<{ id: string; title: string }[]>(`/api/v1/workspaces/${workspaceId}/projects`) });

  const pipeline = pipelines.data?.find((p) => p.id === selected) ?? pipelines.data?.[0];
  const fail = (e: unknown) => setError(e instanceof ApiFailure ? (e.code === "plan_limit" ? t("planLimit") : e.message) : t("error"));
  const refresh = (...keys: string[]) => keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t("crmSettings")}</h1>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Panel title={t("pipelines")} hint={t("pipelinesHint")}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select className={`${selectClass} w-52`} aria-label={t("pipeline")} value={pipeline?.id ?? ""} onChange={(e) => setSelected(e.target.value)}>
            {pipelines.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isDefault ? " ★" : ""}
              </option>
            ))}
          </select>
          {pipeline && !pipeline.isDefault && (
            <Button size="sm" variant="outline" onClick={() => api.patch(`/api/v1/pipelines/${pipeline.id}`, { isDefault: true }).then(() => refresh("pipelines")).catch(fail)}>
              {t("makeDefault")}
            </Button>
          )}
          {pipeline && (pipelines.data?.length ?? 0) > 1 && (
            <Button size="sm" variant="danger" onClick={() => window.confirm(t("deletePipelineConfirm")) && api.del(`/api/v1/pipelines/${pipeline.id}`).then(() => (setSelected(null), refresh("pipelines"))).catch(fail)}>
              {t("deletePipeline")}
            </Button>
          )}
          <form
            className="ml-auto flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              api.post(`/api/v1/workspaces/${workspaceId}/pipelines`, { name: newPipeline }).then(() => (setNewPipeline(""), setError(null), refresh("pipelines"))).catch(fail);
            }}
          >
            <Input aria-label={t("newPipeline")} placeholder={t("newPipeline")} value={newPipeline} onChange={(e) => setNewPipeline(e.target.value)} className="w-44" />
            <Button size="sm" type="submit" disabled={!newPipeline.trim()}>
              <Plus className="size-4" />
            </Button>
          </form>
        </div>
        {pipeline && <StageEditor pipeline={pipeline} workspaceId={workspaceId} onSaved={() => refresh("pipelines", "board")} />}
      </Panel>

      <Panel title={t("lostReasons")} hint={t("lostReasonsHint")}>
        <ul className="mb-2 flex flex-wrap gap-2">
          {reasons.data?.map((r) => (
            <li key={r.id} className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm">
              {r.name}
              <button aria-label={`${t("delete")} ${r.name}`} className="text-muted-foreground hover:text-danger" onClick={() => api.del(`/api/v1/lost-reasons/${r.id}`).then(() => refresh("lost-reasons")).catch(fail)}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            api.post(`/api/v1/workspaces/${workspaceId}/lost-reasons`, { name: reason }).then(() => (setReason(""), setError(null), refresh("lost-reasons"))).catch(fail);
          }}
        >
          <Input aria-label={t("newReason")} placeholder={t("newReason")} value={reason} onChange={(e) => setReason(e.target.value)} className="max-w-64" />
          <Button size="sm" type="submit" disabled={!reason.trim()}>
            {t("add")}
          </Button>
        </form>
      </Panel>

      <Panel title={t("projectTemplates")} hint={t("projectTemplatesHint")}>
        <ul className="mb-3 flex flex-col gap-1 text-sm">
          {templates.data?.builtIn.filter((b) => !b.empty).map((b) => (
            <li key={b.key} className="text-muted-foreground">
              {b.name} · {t("builtIn")}
            </li>
          ))}
          {templates.data?.custom.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              {c.name}
              <span className="text-xs text-muted-foreground">{t("days", { count: c.defaultDurationDays })}</span>
              <button aria-label={`${t("delete")} ${c.name}`} className="ml-auto text-muted-foreground hover:text-danger" onClick={() => api.del(`/api/v1/project-templates/${c.id}`).then(() => refresh("templates")).catch(fail)}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            api.post(`/api/v1/projects/${fromProject.id}/save-as-template`, { name: fromProject.name }).then(() => (setFromProject({ id: "", name: "" }), setError(null), refresh("templates"))).catch(fail);
          }}
        >
          <select className={`${selectClass} w-52`} aria-label={t("fromProject")} value={fromProject.id} onChange={(e) => setFromProject({ ...fromProject, id: e.target.value })}>
            <option value="">{t("fromProject")}…</option>
            {projects.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <Input aria-label={t("templateName")} placeholder={t("templateName")} value={fromProject.name} onChange={(e) => setFromProject({ ...fromProject, name: e.target.value })} className="w-52" />
          <Button size="sm" type="submit" disabled={!fromProject.id || !fromProject.name.trim()}>
            {t("saveAsTemplate")}
          </Button>
        </form>
      </Panel>
    </div>
  );
}
