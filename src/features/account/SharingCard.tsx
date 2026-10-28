"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { api } from "@/features/mindmap/api";

interface Sharing {
  sponsor: { name: string } | null;
  share: boolean;
}

/**
 * The person's own choice: let whoever invited them see a summary of their activity (numbers and the date of the last action, never names or
 * contents). Shown only to people who came through someone's link; off until they switch it on, and off again at any time.
 */
export function SharingCard() {
  const t = useTranslations("sharing");
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["account-sharing"], queryFn: () => api.get<Sharing>("/api/v1/account/sharing"), retry: false });
  const set = useMutation({
    mutationFn: (share: boolean) => api.put<Sharing>("/api/v1/account/sharing", { share }),
    onSuccess: (d) => qc.setQueryData(["account-sharing"], d),
  });
  if (!data?.sponsor) return null;
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5" data-testid="sharing-card">
      <h2 className="text-base font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">{t("hint", { name: data.sponsor.name })}</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={data.share} disabled={set.isPending} onChange={(e) => set.mutate(e.target.checked)} data-testid="sharing-toggle" />
        {t("toggle", { name: data.sponsor.name })}
      </label>
    </section>
  );
}
