"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FormField, Modal, selectClass } from "@/components/ui/modal";
import { ApiFailure } from "@/features/mindmap/api";
import { cn } from "@/lib/utils";

type Entity = "contacts" | "companies";

interface Preview {
  encoding: string;
  encodingGuessed: boolean;
  delimiter: string;
  headers: string[];
  mapping: Record<string, string>;
  fields: string[];
  totalRows: number;
  truncated: boolean;
  parseErrors: string[];
  summary: { created: number; updated: number; skipped: number; errorCount: number; errors: { row: number; message: string }[] };
  sample: { row: number; ok: boolean; error: string | null; action: string; record: Record<string, unknown> | null }[];
}

interface Result {
  created: number;
  updated: number;
  skipped: number;
  errorCount: number;
  errors: { row: number; message: string }[];
}

async function post<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: "POST", body: form });
  const body = (await res.json().catch(() => null)) as (T & { error?: { code?: string; message?: string } }) | null;
  if (!res.ok) throw new ApiFailure(res.status, body?.error?.code ?? "error", body?.error?.message ?? res.statusText);
  return body as T;
}

const ACTION_STYLE: Record<string, string> = { create: "text-[var(--health-green)]", update: "text-primary", skip: "text-muted-foreground", error: "text-[var(--health-red)]" };

export function ImportWizard({ open, onClose, workspaceId, entity }: { open: boolean; onClose: () => void; workspaceId: string; entity: Entity }) {
  const t = useTranslations("crm");
  const tc = useTranslations("common");
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [policy, setPolicy] = useState<"skip" | "update" | "create">("skip");
  const [encoding, setEncoding] = useState("auto");
  const [mapping, setMapping] = useState<Record<string, string> | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/v1/workspaces/${workspaceId}/imports`;
  const form = (f: File, m: Record<string, string> | null, pol = policy, enc = encoding) => {
    const fd = new FormData();
    fd.set("file", f);
    fd.set("entity", entity);
    fd.set("policy", pol);
    if (enc !== "auto") fd.set("encoding", enc);
    if (m) fd.set("mapping", JSON.stringify(m));
    return fd;
  };
  const fail = (e: unknown) => setError(e instanceof ApiFailure ? (e.code === "plan_limit" ? t("planLimit") : e.message) : t("error"));

  async function runPreview(f: File, m: Record<string, string> | null, pol = policy, enc = encoding) {
    setBusy(true);
    setError(null);
    try {
      const p = await post<Preview>(`${base}/preview`, form(f, m, pol, enc));
      setPreview(p);
      setMapping(p.mapping);
    } catch (e) {
      fail(e);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await post<Result>(`${base}/commit`, form(file, mapping)));
      await Promise.all([qc.invalidateQueries({ queryKey: ["companies"] }), qc.invalidateQueries({ queryKey: ["contacts"] }), qc.invalidateQueries({ queryKey: ["company-options"] })]);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setMapping(null);
    setError(null);
    setEncoding("auto");
    setPolicy("skip");
  }
  const close = () => {
    reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title={entity === "contacts" ? t("importContacts") : t("importCompanies")} wide>
      {result ? (
        <div className="flex flex-col gap-3" data-testid="import-result">
          <p className="text-sm">{t("importDone", { created: result.created, updated: result.updated, skipped: result.skipped })}</p>
          {result.errorCount > 0 && (
            <div>
              <p className="text-sm font-medium text-[var(--health-red)]">{t("importErrors", { count: result.errorCount })}</p>
              <ul className="mt-1 max-h-40 overflow-auto text-xs text-muted-foreground">
                {result.errors.map((e) => (
                  <li key={e.row}>
                    {t("row", { n: e.row })}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end">
            <Button onClick={close}>{t("close")}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label={t("csvFile")}>
              <input
                ref={input}
                type="file"
                accept=".csv,text/csv,.txt"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setFile(f);
                    void runPreview(f, null);
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={() => input.current?.click()}>
                <FileUp className="size-4" />
                {file ? file.name : t("chooseFile")}
              </Button>
            </FormField>
            <FormField label={t("duplicates")} hint={t("duplicatesHint")}>
              <select
                className={selectClass}
                value={policy}
                onChange={(e) => {
                  const p = e.target.value as typeof policy;
                  setPolicy(p);
                  if (file) void runPreview(file, mapping, p);
                }}
              >
                <option value="skip">{t("policySkip")}</option>
                <option value="update">{t("policyUpdate")}</option>
                <option value="create">{t("policyCreate")}</option>
              </select>
            </FormField>
            <FormField label={t("encoding")}>
              <select
                className={selectClass}
                value={encoding}
                onChange={(e) => {
                  setEncoding(e.target.value);
                  if (file) void runPreview(file, null, policy, e.target.value);
                }}
              >
                <option value="auto">{t("encodingAuto")}</option>
                <option value="utf-8">UTF-8</option>
                <option value="windows-1251">Windows-1251 (Cyrillic)</option>
                <option value="windows-1250">Windows-1250 (Central Europe)</option>
              </select>
            </FormField>
          </div>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          {preview && (
            <>
              <p className="text-xs text-muted-foreground">
                {t("detected", { rows: preview.totalRows, delimiter: preview.delimiter === "\t" ? "TAB" : preview.delimiter, encoding: preview.encoding })}
                {preview.encodingGuessed && <span className="ml-1 text-[var(--health-yellow)]">{t("encodingGuessed")}</span>}
                {preview.truncated && <span className="ml-1 text-[var(--health-yellow)]">{t("truncated")}</span>}
              </p>

              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("mapColumns")}</h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {preview.fields.map((f) => (
                    <label key={f} className="flex items-center gap-2 text-sm">
                      <span className="w-28 shrink-0 text-muted-foreground">{t(`field.${f}`)}</span>
                      <select
                        className={cn(selectClass, "h-8")}
                        aria-label={t(`field.${f}`)}
                        value={mapping?.[f] ?? ""}
                        onChange={(e) => {
                          const next = { ...(mapping ?? {}) };
                          if (e.target.value) next[f] = e.target.value;
                          else delete next[f];
                          setMapping(next);
                          if (file) void runPreview(file, next);
                        }}
                      >
                        <option value="">—</option>
                        {preview.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 text-sm" data-testid="import-summary">
                <span className="text-[var(--health-green)]">{t("willCreate", { count: preview.summary.created })}</span>
                <span className="text-primary">{t("willUpdate", { count: preview.summary.updated })}</span>
                <span className="text-muted-foreground">{t("willSkip", { count: preview.summary.skipped })}</span>
                <span className="text-[var(--health-red)]">{t("willFail", { count: preview.summary.errorCount })}</span>
              </div>

              <div className="max-h-56 overflow-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1">#</th>
                      <th className="px-2 py-1">{t("verdict")}</th>
                      <th className="px-2 py-1">{t("preview")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((r) => (
                      <tr key={r.row} className="border-t border-border">
                        <td className="px-2 py-1 tabular-nums">{r.row}</td>
                        <td className={cn("px-2 py-1 font-medium", ACTION_STYLE[r.action])}>{t(`verdictOf.${r.action}`)}</td>
                        <td className="px-2 py-1 text-muted-foreground">{r.error ?? Object.values(r.record ?? {}).filter((v) => typeof v === "string" || Array.isArray(v)).map((v) => (Array.isArray(v) ? v.join(", ") : String(v))).filter(Boolean).join(" · ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              {tc("cancel")}
            </Button>
            <Button disabled={!preview || busy || preview.summary.created + preview.summary.updated === 0} onClick={commit}>
              {t("runImport")}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
