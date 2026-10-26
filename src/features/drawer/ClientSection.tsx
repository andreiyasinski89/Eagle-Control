"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { api, ApiFailure } from "@/features/mindmap/api";

interface Approval {
  id: string;
  status: "PENDING" | "APPROVED" | "CHANGES_REQUESTED";
  request: string | null;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
}

/** Sharing a node with the project's clients, and asking them to sign off on it. */
export function ClientSection({ nodeId, shared, canWrite, onShare }: { nodeId: string; shared: boolean; canWrite: boolean; onShare: (v: boolean) => void }) {
  const t = useTranslations("drawer");
  const locale = useLocale();
  const qc = useQueryClient();
  const key = ["approvals", nodeId];
  const { data } = useQuery({ queryKey: key, enabled: shared, queryFn: () => api.get<{ items: Approval[] }>(`/api/v1/nodes/${nodeId}/approvals`) });
  const [request, setRequest] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ask = useMutation({
    mutationFn: () => api.post(`/api/v1/nodes/${nodeId}/approvals`, { request: request.trim() || undefined }),
    onSuccess: () => {
      setRequest("");
      setError(null);
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => setError(e instanceof ApiFailure ? e.message : t("uploadFailed")),
  });
  const pending = data?.items.find((a) => a.status === "PENDING");
  const label = { APPROVED: t("approved"), CHANGES_REQUESTED: t("changesRequested"), PENDING: t("awaitingClient") } as const;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" disabled={!canWrite} checked={shared} onChange={(e) => onShare(e.target.checked)} />
        {t("shareWithClient")}
      </label>
      {shared && (
        <>
          <p className="text-xs text-muted-foreground">{t("shareHint")}</p>
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
          {canWrite && !pending && (
            <div className="flex gap-2">
              <input aria-label={t("approvalRequest")} placeholder={t("approvalRequest")} className="h-8 min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-sm" maxLength={1000} value={request} onChange={(e) => setRequest(e.target.value)} />
              <Button size="sm" variant="outline" disabled={ask.isPending} onClick={() => ask.mutate()}>
                {t("askApproval")}
              </Button>
            </div>
          )}
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {data?.items.map((a) => (
              <li key={a.id}>
                <span className="font-medium text-foreground">{label[a.status]}</span> · {new Date(a.decidedAt ?? a.createdAt).toLocaleDateString(locale)}
                {a.note ? ` — ${a.note}` : a.request ? ` — ${a.request}` : ""}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
