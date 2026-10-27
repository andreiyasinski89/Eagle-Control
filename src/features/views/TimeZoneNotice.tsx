"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { api } from "@/features/mindmap/api";
import { browserTimeZone } from "@/modules/views/tz";

const DISMISSED = "meetowl:tzNoticeDismissed";

const dismissed = (): boolean => {
  try {
    return localStorage.getItem(DISMISSED) === "1";
  } catch {
    return false;
  }
};

/** Shown once to someone who never picked a zone while their browser is clearly somewhere else than UTC. */
export function TimeZoneNotice({ saved }: { saved: string | null }) {
  const t = useTranslations("views");
  const qc = useQueryClient();
  const [hidden, setHidden] = useState(false);
  const detected = typeof window === "undefined" ? "UTC" : browserTimeZone();
  const use = useMutation({
    mutationFn: () => api.patch("/api/v1/me", { timezone: detected }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["me"] }),
  });
  if (hidden || saved !== "UTC" || detected === "UTC" || dismissed()) return null;
  return (
    <div role="status" data-testid="tz-notice" className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <span>{t("tzDetected", { zone: detected })}</span>
      <Button size="sm" disabled={use.isPending} onClick={() => use.mutate()}>
        {t("tzUse", { zone: detected })}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          try {
            localStorage.setItem(DISMISSED, "1");
          } catch {
            /* only a convenience */
          }
          setHidden(true);
        }}
      >
        {t("tzKeepUtc")}
      </Button>
    </div>
  );
}
