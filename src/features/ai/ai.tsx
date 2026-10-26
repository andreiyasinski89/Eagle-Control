"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { api, ApiFailure } from "@/features/mindmap/api";
import { cn } from "@/lib/utils";

interface Status {
  allowed: boolean;
  configured: boolean;
  used: number;
  quota: number;
  warn: boolean;
  exhausted: boolean;
  renewsOn: string;
}

export const useAiStatus = (workspaceId: string | null) =>
  useQuery({ queryKey: ["ai-status", workspaceId], enabled: !!workspaceId, staleTime: 30_000, queryFn: () => api.get<Status>(`/api/v1/workspaces/${workspaceId}/ai`) });

const message = (e: unknown, fallback: string) => (e instanceof ApiFailure ? e.message : fallback);

/** AI output is always a draft: shown, editable, copyable, never posted or sent on its own. */
function Draft({ text, onChange }: { text: string; onChange: (v: string) => void }) {
  const t = useTranslations("ai");
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <textarea aria-label={t("draft")} data-testid="ai-draft" className="min-h-40 w-full rounded-md border border-border bg-card p-2 text-sm" value={text} onChange={(e) => onChange(e.target.value)} />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t("draftNote")}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard?.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Copy className="size-3.5" />
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
    </div>
  );
}

function Usage({ s }: { s: Status }) {
  const t = useTranslations("ai");
  return (
    <p className={cn("text-xs", s.warn || s.exhausted ? "text-[var(--health-red)]" : "text-muted-foreground")}>
      {s.exhausted ? t("exhausted", { date: s.renewsOn }) : t("usage", { used: Math.round(s.used / 1000), quota: Math.round(s.quota / 1000) })}
    </p>
  );
}

/** Project-level assistant: team summary, client update, and questions about the project. */
export function AiAssistant({ projectId, workspaceId }: { projectId: string; workspaceId: string }) {
  const t = useTranslations("ai");
  const status = useAiStatus(workspaceId);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"summary" | "client" | "ask">("summary");
  const [question, setQuestion] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: () =>
      tab === "ask" ? api.post<{ text: string }>("/api/v1/ai/ask", { projectId, question }) : api.post<{ text: string }>("/api/v1/ai/summary", { projectId, audience: tab === "client" ? "client" : "team" }),
    onSuccess: (r) => {
      setText(r.text);
      setError(null);
      void status.refetch();
    },
    onError: (e) => setError(message(e, t("error"))),
  });
  const s = status.data;
  if (s && !s.allowed) return null; // Free plan or guests: no button at all

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="ai-open">
        <Sparkles className="size-4" />
        AI
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("title")}>
        <div className="flex gap-1 rounded-lg border border-border p-1 text-sm" role="tablist">
          {(["summary", "client", "ask"] as const).map((x) => (
            <button key={x} role="tab" aria-selected={tab === x} onClick={() => { setTab(x); setText(""); setError(null); }} className={cn("flex-1 rounded-md px-3 py-1", tab === x ? "bg-muted font-medium" : "text-muted-foreground")}>
              {t(`tab.${x}`)}
            </button>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">{t(`hint.${tab}`)}</p>
        {tab === "ask" && <input aria-label={t("question")} placeholder={t("question")} maxLength={500} className="h-9 rounded-md border border-border bg-card px-3 text-sm" value={question} onChange={(e) => setQuestion(e.target.value)} />}
        {s && !s.configured && <p className="text-sm text-muted-foreground">{t("notConfigured")}</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={run.isPending || (s && (!s.configured || s.exhausted)) || (tab === "ask" && question.trim().length < 3)} onClick={() => run.mutate()}>
            {run.isPending ? t("thinking") : t("generate")}
          </Button>
          {s && <Usage s={s} />}
        </div>
        {text && <Draft text={text} onChange={setText} />}
      </Modal>
    </>
  );
}

interface Suggestion {
  title: string;
  estimation: number | null;
}

/** Proposes subtasks for a node; only the ones ticked are created. */
export function AiBreakdown({ nodeId, workspaceId, onCreated }: { nodeId: string; workspaceId: string; onCreated: () => void }) {
  const t = useTranslations("ai");
  const status = useAiStatus(workspaceId);
  const [items, setItems] = useState<(Suggestion & { on: boolean })[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const suggest = useMutation({
    mutationFn: () => api.post<{ suggestions: Suggestion[] }>("/api/v1/ai/breakdown", { nodeId }),
    onSuccess: (r) => {
      setItems(r.suggestions.map((s) => ({ ...s, on: true })));
      setError(null);
      void status.refetch();
    },
    onError: (e) => setError(message(e, t("error"))),
  });
  const apply = useMutation({
    mutationFn: () => api.post("/api/v1/ai/breakdown/apply", { nodeId, items: (items ?? []).filter((i) => i.on).map(({ title, estimation }) => ({ title, estimation })) }),
    onSuccess: () => {
      setItems(null);
      onCreated();
    },
    onError: (e) => setError(message(e, t("error"))),
  });
  const s = status.data;
  if (s && !s.allowed) return null;
  return (
    <div className="flex flex-col gap-2 text-sm">
      {!items && (
        <Button size="sm" variant="outline" className="w-fit" disabled={suggest.isPending || (s && (!s.configured || s.exhausted))} onClick={() => suggest.mutate()}>
          <Sparkles className="size-4" />
          {suggest.isPending ? t("thinking") : t("suggestSubtasks")}
        </Button>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {items && (
        <>
          <ul className="flex flex-col gap-1" data-testid="ai-suggestions">
            {items.map((it, i) => (
              <li key={i} className="flex items-center gap-2">
                <input type="checkbox" aria-label={it.title} checked={it.on} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
                <input aria-label={t("fieldTitle")} className="h-7 min-w-0 flex-1 rounded border border-border bg-card px-2 text-sm" value={it.title} maxLength={120} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                {it.estimation && <span className="text-xs text-muted-foreground">{it.estimation} h</span>}
              </li>
            ))}
            {items.length === 0 && <li className="text-xs text-muted-foreground">{t("nothingNew")}</li>}
          </ul>
          <div className="flex gap-2">
            <Button size="sm" disabled={apply.isPending || !items.some((i) => i.on && i.title.trim())} onClick={() => apply.mutate()}>
              {t("addSelected")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setItems(null)}>
              {t("discard")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/** A reply to the customer, drafted from the deal and its history. */
export function AiLeadReply({ dealId, workspaceId }: { dealId: string; workspaceId: string }) {
  const t = useTranslations("ai");
  const status = useAiStatus(workspaceId);
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const draft = useMutation({
    mutationFn: () => api.post<{ text: string }>("/api/v1/ai/lead-reply", { dealId, intent: intent.trim() || undefined }),
    onSuccess: (r) => {
      setText(r.text);
      setError(null);
      void status.refetch();
    },
    onError: (e) => setError(message(e, t("error"))),
  });
  const s = status.data;
  if (s && !s.allowed) return null;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Sparkles className="size-4" />
        {t("draftReply")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("draftReply")}>
        <input aria-label={t("intent")} placeholder={t("intent")} maxLength={300} className="h-9 rounded-md border border-border bg-card px-3 text-sm" value={intent} onChange={(e) => setIntent(e.target.value)} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={draft.isPending || (s && (!s.configured || s.exhausted))} onClick={() => draft.mutate()}>
            {draft.isPending ? t("thinking") : t("generate")}
          </Button>
          {s && <Usage s={s} />}
        </div>
        {text && <Draft text={text} onChange={setText} />}
      </Modal>
    </>
  );
}
