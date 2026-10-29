"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/features/mindmap/api";
import type { UiMode } from "@/modules/ui-mode";

interface Data {
  mode: UiMode;
  chosen: boolean;
}

/** Simple or advanced: the same data, with the words and the fields of an agile team left out (or put back). Applies at once, on every device. */
export function UiModeCard() {
  const t = useTranslations("account");
  const qc = useQueryClient();
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["ui-mode"], queryFn: () => api.get<Data>("/api/v1/account/ui-mode") });
  const set = useMutation({
    mutationFn: (mode: UiMode) => api.put<Data>("/api/v1/account/ui-mode", { mode }),
    onSuccess: (d) => {
      qc.setQueryData(["ui-mode"], d);
      setNote(t("uiModeSaved"));
      router.refresh();
    },
    onError: () => setNote(t("uiModeFailed")),
  });
  if (!data) return null;
  const options: { mode: UiMode; label: string; hint: string }[] = [
    { mode: "simple", label: t("uiModeSimple"), hint: t("uiModeSimpleHint") },
    { mode: "advanced", label: t("uiModeAdvanced"), hint: t("uiModeAdvancedHint") },
  ];
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5" data-testid="ui-mode-card">
      <div>
        <h2 className="text-base font-semibold">{t("uiModeTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("uiModeHint")}</p>
      </div>
      <div role="radiogroup" aria-label={t("uiModeTitle")} className="flex flex-col gap-2">
        {options.map((o) => (
          <label key={o.mode} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 ${data.mode === o.mode ? "border-primary bg-primary/5" : "border-border"}`}>
            <input type="radio" name="ui-mode" className="mt-1" checked={data.mode === o.mode} disabled={set.isPending} onChange={() => (setNote(null), set.mutate(o.mode))} data-testid={`ui-mode-${o.mode}`} />
            <span className="flex flex-col gap-0.5 text-sm">
              <span className="font-medium">{o.label}</span>
              <span className="text-xs text-muted-foreground">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      {note && (
        <p role="status" className="text-xs text-muted-foreground">
          {note}
        </p>
      )}
    </section>
  );
}
