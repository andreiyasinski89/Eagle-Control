"use client";

import { useState } from "react";
import { ClipboardCopy } from "lucide-react";
import { useTranslations } from "next-intl";
import { copyToClipboard, useScriptFiller, useScripts } from "./useScripts";

/** The scripts that fit this person's stage (and those for any moment), each ready to copy with their name filled in. */
export function ScriptPicker({ workspaceId, meId, stage, fullName }: { workspaceId: string; meId: string; stage: string; fullName: string }) {
  const t = useTranslations("crm");
  const scripts = useScripts(workspaceId);
  const fill = useScriptFiller(workspaceId, meId);
  const [copied, setCopied] = useState<string | null>(null);
  const mine = (scripts.data ?? []).filter((s) => s.stage === stage || s.stage === null);

  if (scripts.data && mine.length === 0) return <p className="text-xs text-muted-foreground">{t("scriptsNoneForStage")}</p>;
  return (
    <ul className="flex flex-col gap-2" data-testid="script-picker">
      {mine.map((s) => {
        const text = fill(s.body, fullName);
        return (
          <li key={s.id} className="rounded-md bg-muted/60 p-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{s.title}</span>
              <button
                type="button"
                data-testid="picker-copy"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs hover:bg-muted"
                onClick={async () => {
                  if (await copyToClipboard(text)) {
                    setCopied(s.id);
                    setTimeout(() => setCopied((c) => (c === s.id ? null : c)), 2000);
                  }
                }}
              >
                <ClipboardCopy className="size-3.5" />
                {copied === s.id ? t("handoff.copied") : t("handoff.copy")}
              </button>
            </div>
            <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{text}</p>
          </li>
        );
      })}
    </ul>
  );
}
