"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Copy, Pencil, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { api, ApiFailure } from "@/features/mindmap/api";
import { CHANNEL_LABEL, type DraftChannel } from "@/modules/crm/draft-links";

interface DraftRow {
  id: string;
  contactId: string;
  contactName: string;
  consentGiven: boolean;
  channel: DraftChannel;
  text: string;
  status: "PENDING" | "APPROVED";
  reason: string | null;
  createdAt: string;
  openUrl: string | null;
}

export function AgentDraftsView({ workspaceId, slug, canWrite }: { workspaceId: string; slug: string; canWrite: boolean }) {
  const t = useTranslations("agentDrafts");
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({ queryKey: ["agent-drafts", workspaceId], queryFn: () => api.get<{ total: number; items: DraftRow[] }>(`/api/v1/workspaces/${workspaceId}/agent-drafts`) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["agent-drafts", workspaceId] });
    void qc.invalidateQueries({ queryKey: ["activities"] });
  };
  const fail = (e: unknown) => {
    setError(e instanceof ApiFailure ? (e.code === "consent_required" ? t("consentLost") : e.code === "draft_settled" ? t("settled") : e.message) : t("copyFailed"));
    refresh();
  };

  const save = useMutation({
    mutationFn: (v: { id: string; text: string }) => api.patch(`/api/v1/agent-drafts/${v.id}`, { text: v.text }),
    onSuccess: () => (setEditing(null), setError(null), refresh()),
    onError: fail,
  });
  const reject = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/agent-drafts/${id}/reject`),
    onSuccess: () => (setError(null), refresh()),
    onError: fail,
  });
  const sent = useMutation({ mutationFn: (id: string) => api.post(`/api/v1/agent-drafts/${id}/sent`), onSuccess: () => (setError(null), refresh()), onError: fail });

  /**
   * Copies the text first and marks the draft SENT only once the clipboard accepted it. The chat opens synchronously,
   * inside the click, or the browser's popup blocker would eat it after the network round trip.
   */
  async function copyAndOpen(d: DraftRow) {
    setError(null);
    const copied = navigator.clipboard.writeText(d.text);
    if (d.openUrl) window.open(d.openUrl, "_blank", "noopener,noreferrer");
    try {
      await copied;
    } catch {
      setError(t("copyFailed"));
      return;
    }
    sent.mutate(d.id);
  }

  const items = list.data?.items ?? [];
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 text-sm">
        <Bot className="size-4 text-muted-foreground" />
        <h1 className="font-medium">{t("title")}</h1>
        <span className="text-muted-foreground">{t("count", { count: items.length })}</span>
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-border bg-card px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <ul className="flex flex-col gap-3" aria-label={t("title")}>
        {items.length === 0 && <li className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">{list.isLoading ? "…" : t("empty")}</li>}
        {items.map((d) => (
          <li key={d.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-sm" data-testid={`draft-${d.id}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link className="font-medium hover:underline" href={`/w/${slug}/crm/contacts?contact=${d.contactId}`}>
                {d.contactName}
              </Link>
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{CHANNEL_LABEL[d.channel]}</span>
              {d.status === "APPROVED" && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Check className="size-3" />
                  {t("approved")}
                </span>
              )}
            </div>
            {d.reason && (
              <p className="text-xs text-muted-foreground">
                {t("why")}: {d.reason}
              </p>
            )}
            {editing?.id === d.id ? (
              <textarea
                aria-label={t("textLabel")}
                className="min-h-28 w-full rounded-md border border-border bg-background p-2 text-sm"
                value={editing.text}
                maxLength={4000}
                onChange={(e) => setEditing({ id: d.id, text: e.target.value })}
              />
            ) : (
              <p className="whitespace-pre-wrap">{d.text}</p>
            )}
            {!d.openUrl && <p className="text-xs text-muted-foreground">{t("noHandle", { channel: CHANNEL_LABEL[d.channel] })}</p>}
            {canWrite && (
              <div className="flex flex-wrap gap-2">
                {editing?.id === d.id ? (
                  <>
                    <Button size="sm" disabled={save.isPending || !editing.text.trim()} onClick={() => save.mutate(editing)}>
                      {t("save")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      {t("cancel")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button size="sm" disabled={sent.isPending} onClick={() => void copyAndOpen(d)}>
                      <Copy className="size-4" />
                      {d.openUrl ? t("copyOpen", { channel: CHANNEL_LABEL[d.channel] }) : t("copyOnly")}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing({ id: d.id, text: d.text })}>
                      <Pencil className="size-4" />
                      {t("edit")}
                    </Button>
                    <Button size="sm" variant="danger" disabled={reject.isPending} onClick={() => reject.mutate(d.id)}>
                      <X className="size-4" />
                      {t("reject")}
                    </Button>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
