"use client";

import { useRef, useState } from "react";
import { Paperclip, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { api, ApiFailure } from "@/features/mindmap/api";
import type { NodeDetail } from "./types";

const MAX = 25 * 1024 * 1024;

function size(n: number): string {
  return n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function Attachments({ nodeId, items, canWrite, onChange, shared }: { nodeId: string; items: NodeDetail["attachments"]; canWrite: boolean; onChange: () => void; shared?: boolean }) {
  const t = useTranslations("drawer");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (file.size > MAX) return setError(t("tooLarge"));
    setBusy(true);
    try {
      const mime = file.type || "application/octet-stream";
      const meta = { fileName: file.name, mime, size: file.size };
      const { key, uploadUrl } = await api.post<{ key: string; uploadUrl: string }>(`/api/v1/nodes/${nodeId}/attachments/presign`, meta);
      const put = await fetch(uploadUrl, { method: "PUT", headers: { "content-type": mime }, body: file });
      if (!put.ok) throw new Error("upload failed");
      await api.post(`/api/v1/nodes/${nodeId}/attachments`, { ...meta, key });
      onChange();
    } catch (err) {
      setError(err instanceof ApiFailure ? err.message : t("uploadFailed"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && <p className="text-sm text-muted-foreground">{t("noAttachments")}</p>}
      <ul className="flex flex-col gap-1">
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-sm">
            <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
            <a className="truncate hover:underline" href={`/api/v1/attachments/${a.id}/download`}>
              {a.fileName}
            </a>
            <span className="shrink-0 text-xs text-muted-foreground">{size(a.size)}</span>
            {shared && canWrite && (
              <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  aria-label={`${t("shareFile")} ${a.fileName}`}
                  checked={a.visibleToClient === true}
                  onChange={async (e) => {
                    await api.patch(`/api/v1/attachments/${a.id}`, { visibleToClient: e.target.checked });
                    onChange();
                  }}
                />
                {t("client")}
              </label>
            )}
            {canWrite && (
              <button
                className="ml-auto text-muted-foreground hover:text-danger"
                aria-label={`${t("delete")} ${a.fileName}`}
                onClick={async () => {
                  await api.del(`/api/v1/attachments/${a.id}`);
                  onChange();
                }}
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canWrite && (
        <>
          <input ref={input} type="file" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            {t("attach")}
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
