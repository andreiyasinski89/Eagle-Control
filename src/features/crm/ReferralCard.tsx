"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { api } from "@/features/mindmap/api";

/** Your invitation link: send it to people you know; whoever creates an account through it lands in your people as a new lead. */
export function ReferralCard({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("referral");
  const { data, isError } = useQuery({ queryKey: ["referral", workspaceId], queryFn: () => api.get<{ code: string; url: string; joined: number }>(`/api/v1/workspaces/${workspaceId}/referral`), retry: false });
  const [copied, setCopied] = useState(false);
  if (isError || !data) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4" data-testid="referral-card">
      <div className="flex items-center gap-2 font-medium">
        <Link2 className="size-4 text-primary" aria-hidden />
        {t("title")}
      </div>
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input readOnly value={data.url} onFocus={(e) => e.currentTarget.select()} aria-label={t("title")} data-testid="referral-url" className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm" />
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()} data-testid="referral-copy">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground" data-testid="referral-joined">
        {t("joined", { n: data.joined })}
      </p>
    </section>
  );
}
