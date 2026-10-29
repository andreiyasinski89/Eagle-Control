"use client";

import { useState } from "react";
import { ReferralQr } from "./ReferralQr";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Link2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { api } from "@/features/mindmap/api";

/** Your invitation link: send it to people you know; whoever creates an account through it lands in your people as a new lead. */
export function ReferralCard({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("referral");
  const { data, isError } = useQuery({ queryKey: ["referral", workspaceId], queryFn: () => api.get<{ code: string; url: string; leadUrl: string | null; name: string; joined: number }>(`/api/v1/workspaces/${workspaceId}/referral`), retry: false });
  const [copied, setCopied] = useState(false);
  const [kind, setKind] = useState<"invite" | "clients">("clients");
  if (isError || !data) return null;
  const link = kind === "clients" && data.leadUrl ? data.leadUrl : data.url;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
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
      <div role="radiogroup" aria-label={t("kindLabel")} className="flex flex-wrap gap-2">
        {(["clients", "invite"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`min-h-11 rounded-full border px-4 text-sm ${kind === k ? "border-primary bg-primary/10 font-medium" : "border-border text-muted-foreground"}`} data-testid={`referral-kind-${k}`}>
            {t(k === "clients" ? "kindClients" : "kindInvite")}
          </button>
        ))}
      </div>
      {kind === "clients" && !data.leadUrl && <p className="text-xs text-muted-foreground" data-testid="referral-no-form">{t("noForm")}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label={t("title")} data-testid="referral-url" className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm" />
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()} data-testid="referral-copy">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
      <ReferralQr url={link} name={data.name} fileName={`meetowl-${data.code}`} />
      <p className="text-xs text-muted-foreground" data-testid="referral-label">
        {t("label", { code: data.code })}
      </p>
      <p className="text-xs text-muted-foreground" data-testid="referral-joined">
        {t("joined", { n: data.joined })}
      </p>
    </section>
  );
}
