"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Download, FileText, MessageSquare, Upload, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { api, ApiFailure } from "@/features/mindmap/api";
import { cn } from "@/lib/utils";

interface PNode {
  id: string;
  parentId: string;
  type: string;
  title: string;
  status: string;
  progress: number;
  health: "GREEN" | "YELLOW" | "RED";
  startDate: string | null;
  dueDate: string | null;
  approvalId: string | null;
  content?: unknown;
  startsAt?: string | null;
  endsAt?: string | null;
}
interface Approval {
  id: string;
  nodeId: string;
  status: "PENDING" | "APPROVED" | "CHANGES_REQUESTED";
  request: string | null;
  note: string | null;
  decidedAt: string | null;
  createdAt: string;
}
interface Project {
  workspace: { name: string; slug: string };
  me: { canDecide: boolean; preview: boolean };
  project: { id: string; title: string; progress: number; health: "GREEN" | "YELLOW" | "RED"; startDate: string | null; dueDate: string | null };
  nodes: PNode[];
  approvals: Approval[];
}
interface NodeInfo {
  comments: { id: string; text: string; at: string; author: string; mine: boolean; fromTeam: boolean }[];
  attachments: { id: string; fileName: string; size: number; mime: string }[];
}

const textOf = (doc: unknown): string => {
  const walk = (n: unknown): string => {
    const x = n as { type?: string; text?: string; content?: unknown[] } | null;
    if (!x) return "";
    if (x.type === "text") return x.text ?? "";
    const inner = (x.content ?? []).map(walk).join(x.type === "doc" ? "\n\n" : "");
    return inner;
  };
  return walk(doc);
};

const healthColor = (h: string) => `var(--health-${h.toLowerCase()})`;

/** What a client sees of a project: progress, the shared work, what needs their answer, and a thread with the team. */
export function PortalProject({ projectId }: { projectId: string }) {
  const t = useTranslations("portal");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get("node");
  const qc = useQueryClient();
  const key = ["portal", projectId];
  const { data, error, isLoading } = useQuery({ queryKey: key, queryFn: () => api.get<Project>(`/api/v1/portal/projects/${projectId}`), refetchInterval: 30_000, retry: false });
  const select = (id: string | null) => router.replace(id ? `${pathname}?node=${id}` : pathname, { scroll: false });
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null);

  const order = useMemo(() => {
    if (!data) return [] as { node: PNode; depth: number }[];
    const kids = new Map<string, PNode[]>();
    for (const n of data.nodes) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n]);
    const out: { node: PNode; depth: number }[] = [];
    const walk = (id: string, depth: number) => {
      for (const n of kids.get(id) ?? []) {
        out.push({ node: n, depth });
        walk(n.id, depth + 1);
      }
    };
    walk(projectId, 0);
    return out;
  }, [data, projectId]);

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">…</p>;
  if (error || !data) return <p role="alert" className="p-6 text-sm text-danger">{error instanceof ApiFailure ? error.message : t("error")}</p>;

  const pending = data.approvals.filter((a) => a.status === "PENDING");
  const titleOf = (id: string) => data.nodes.find((n) => n.id === id)?.title ?? "";
  const node = selected ? data.nodes.find((n) => n.id === selected) : null;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <main className="mx-auto min-w-0 max-w-3xl flex-1 p-6">
        <h1 className="text-2xl font-semibold">{data.project.title}</h1>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full" style={{ width: `${data.project.progress}%`, background: healthColor(data.project.health) }} />
          </div>
          <span className="text-sm tabular-nums" data-testid="project-progress">{data.project.progress}%</span>
          <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: healthColor(data.project.health) }}>
            {t(`health.${data.project.health}`)}
          </span>
        </div>
        {(data.project.startDate || data.project.dueDate) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {date(data.project.startDate) ?? "…"} – {date(data.project.dueDate) ?? "…"}
          </p>
        )}
        {data.me.preview && <p className="mt-3 rounded-md bg-muted px-3 py-2 text-xs">{t("previewNote")}</p>}

        {pending.length > 0 && (
          <section data-testid="pending-approvals" className="mt-6 rounded-lg border border-primary bg-primary/10 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="size-4" />
              {t("needsYou", { n: pending.length })}
            </h2>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {pending.map((a) => (
                <li key={a.id}>
                  <button type="button" className="text-left hover:underline" onClick={() => select(a.nodeId)}>
                    {titleOf(a.nodeId)}
                    {a.request && <span className="text-muted-foreground"> — {a.request}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{t("work")}</h2>
          {order.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t("nothingShared")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
              {order.map(({ node: n, depth }) => (
                <li key={n.id}>
                  <button type="button" data-testid="portal-node" onClick={() => select(n.id)} style={{ paddingLeft: 12 + depth * 20 }} className={cn("flex w-full items-center gap-3 py-2.5 pr-3 text-left text-sm hover:bg-muted", selected === n.id && "bg-muted")}>
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: healthColor(n.health) }} aria-hidden />
                    <span className={cn("min-w-0 flex-1 truncate", ["EPIC", "SPRINT"].includes(n.type) && "font-medium")}>{n.title}</span>
                    {n.approvalId && <span className="rounded bg-primary/20 px-1.5 text-xs">{t("awaiting")}</span>}
                    {n.type === "DOCUMENT" && <FileText className="size-4 text-muted-foreground" aria-label={t("document")} />}
                    <span className="hidden text-xs text-muted-foreground sm:inline">{date(n.dueDate)}</span>
                    <span className="w-24 text-right text-xs text-muted-foreground">{t(`status.${n.status}`)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      {node && <NodePanel key={node.id} node={node} data={data} onClose={() => select(null)} onChanged={() => void qc.invalidateQueries({ queryKey: key })} />}
    </div>
  );
}

function NodePanel({ node, data, onClose, onChanged }: { node: PNode; data: Project; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("portal");
  const locale = useLocale();
  const qc = useQueryClient();
  const infoKey = ["portal-node", node.id];
  const { data: info } = useQuery({ queryKey: infoKey, queryFn: () => api.get<NodeInfo>(`/api/v1/portal/nodes/${node.id}`), refetchInterval: 30_000 });
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const fail = (e: unknown) => setError(e instanceof ApiFailure ? e.message : t("error"));
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: infoKey });
    onChanged();
  };
  const comment = useMutation({ mutationFn: () => api.post(`/api/v1/portal/nodes/${node.id}/comments`, { text }), onSuccess: () => { setText(""); setError(null); refresh(); }, onError: fail });
  const decide = useMutation({
    mutationFn: (v: { id: string; decision: "APPROVED" | "CHANGES_REQUESTED" }) => api.post(`/api/v1/portal/approvals/${v.id}`, { decision: v.decision, note: note.trim() || undefined }),
    onSuccess: () => { setNote(""); setAsking(false); setError(null); refresh(); },
    onError: fail,
  });
  const upload = useMutation({
    mutationFn: async (f: File) => {
      const meta = { fileName: f.name, mime: f.type || "application/octet-stream", size: f.size };
      const p = await api.post<{ key: string; uploadUrl: string; headers: Record<string, string> }>(`/api/v1/portal/nodes/${node.id}/attachments/presign`, meta);
      const put = await fetch(p.uploadUrl, { method: "PUT", headers: p.headers, body: f });
      if (!put.ok) throw new Error("upload failed");
      await api.post(`/api/v1/portal/nodes/${node.id}/attachments`, { ...meta, key: p.key });
    },
    onSuccess: () => { setError(null); refresh(); },
    onError: fail,
  });
  const history = data.approvals.filter((a) => a.nodeId === node.id);
  const open = history.find((a) => a.status === "PENDING");
  const body = node.type === "DOCUMENT" ? textOf(node.content) : "";

  return (
    <aside aria-label={t("details")} data-testid="portal-panel" className="sticky top-14 h-[calc(100vh-3.5rem)] w-[400px] shrink-0 overflow-y-auto border-l border-border bg-card max-md:fixed max-md:inset-0 max-md:top-0 max-md:z-40 max-md:h-full max-md:w-full">
      <div className="flex items-start justify-between gap-2 p-4">
        <div>
          <h2 className="text-lg font-semibold">{node.title}</h2>
          <p className="text-xs text-muted-foreground">
            {t(`status.${node.status}`)} · {node.progress}%{node.dueDate ? ` · ${new Date(node.dueDate).toLocaleDateString(locale, { timeZone: "UTC" })}` : ""}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={t("close")}>
          <X className="size-4" />
        </Button>
      </div>
      {error && <p role="alert" className="px-4 pb-2 text-sm text-danger">{error}</p>}
      {body && <div className="whitespace-pre-wrap border-t border-border px-4 py-3 text-sm">{body}</div>}

      {(open || history.length > 0) && (
        <section className="border-t border-border px-4 py-3">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("approval")}</h3>
          {open && (
            <div data-testid="approval-box" className="flex flex-col gap-2 rounded-md bg-primary/10 p-3 text-sm">
              <p>{open.request ?? t("pleaseApprove")}</p>
              {data.me.canDecide ? (
                <>
                  {asking && <textarea aria-label={t("whatToChange")} placeholder={t("whatToChange")} className="min-h-16 rounded-md border border-border bg-card p-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} />}
                  <div className="flex gap-2">
                    <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: open.id, decision: "APPROVED" })}>
                      {t("approve")}
                    </Button>
                    <Button size="sm" variant="outline" disabled={decide.isPending || (asking && !note.trim())} onClick={() => (asking ? decide.mutate({ id: open.id, decision: "CHANGES_REQUESTED" }) : setAsking(true))}>
                      {asking ? t("sendChanges") : t("requestChanges")}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">{t("previewCannotDecide")}</p>
              )}
            </div>
          )}
          <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
            {history.filter((a) => a.status !== "PENDING").map((a) => (
              <li key={a.id}>
                {a.status === "APPROVED" ? t("approvedOn", { date: new Date(a.decidedAt ?? a.createdAt).toLocaleDateString(locale) }) : t("changesOn", { date: new Date(a.decidedAt ?? a.createdAt).toLocaleDateString(locale), note: a.note ?? "" })}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-t border-border px-4 py-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Upload className="size-3.5" />
          {t("files")}
        </h3>
        <ul className="flex flex-col gap-1 text-sm">
          {info?.attachments.map((a) => (
            <li key={a.id}>
              <a className="inline-flex items-center gap-1.5 text-primary hover:underline" href={`/api/v1/portal/attachments/${a.id}`}>
                <Download className="size-3.5" />
                {a.fileName}
              </a>
            </li>
          ))}
          {info?.attachments.length === 0 && <li className="text-xs text-muted-foreground">{t("noFiles")}</li>}
        </ul>
        <input ref={file} type="file" className="hidden" aria-label={t("upload")} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }} />
        <Button size="sm" variant="outline" className="mt-2" disabled={upload.isPending} onClick={() => file.current?.click()}>
          {t("upload")}
        </Button>
      </section>

      <section className="border-t border-border px-4 py-3">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <MessageSquare className="size-3.5" />
          {t("conversation")}
        </h3>
        <ul className="flex flex-col gap-3 text-sm">
          {info?.comments.map((c) => (
            <li key={c.id} data-testid="portal-comment" className={cn("rounded-md p-2", c.mine ? "bg-primary/10" : "bg-muted")}>
              <div className="text-xs text-muted-foreground">
                {c.mine ? t("you") : c.author}
                {c.fromTeam && ` · ${t("team")}`} · {new Date(c.at).toLocaleString(locale)}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap">{c.text}</p>
            </li>
          ))}
          {info?.comments.length === 0 && <li className="text-xs text-muted-foreground">{t("noComments")}</li>}
        </ul>
        <textarea aria-label={t("writeMessage")} placeholder={t("writeMessage")} maxLength={4000} className="mt-3 min-h-20 w-full rounded-md border border-border bg-card p-2 text-sm" value={text} onChange={(e) => setText(e.target.value)} />
        <Button size="sm" className="mt-2" disabled={!text.trim() || comment.isPending} onClick={() => comment.mutate()}>
          {t("send")}
        </Button>
      </section>
    </aside>
  );
}
