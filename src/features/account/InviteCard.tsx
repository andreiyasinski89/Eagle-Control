"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Gift, UserPlus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { api } from "@/features/mindmap/api";

interface Invites {
  code: string;
  url: string;
  points: number;
  invited: { id: string; name: string; joinedAt: string; steps: { workspace: boolean; people: boolean } }[];
}

/**
 * Your link for inviting people to use the platform on their own: each gets a workspace, a client base, the CRM, reports and projects.
 * You see that they came and how far they have got (steps only, never what is in their workspace), and you get a bonus point for each.
 */
export function InviteCard() {
  const t = useTranslations("invite");
  const locale = useLocale();
  const { data, isError } = useQuery({ queryKey: ["account-invites"], queryFn: () => api.get<Invites>("/api/v1/account/invite"), retry: false });
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
  const day = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  const step = (done: boolean, label: string) => (
    <span className={done ? "text-[var(--health-green)]" : "text-muted-foreground"} title={label}>
      {done ? "✓" : "·"} {label}
    </span>
  );

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5" data-testid="invite-card">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
          <UserPlus className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("hint")}</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm" title={t("pointsHint")}>
          <Gift className="size-4 text-primary" aria-hidden />
          <span className="font-semibold tabular-nums" data-testid="invite-points">
            {data.points}
          </span>
          <span className="text-muted-foreground">{t("points")}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input readOnly value={data.url} onFocus={(e) => e.currentTarget.select()} aria-label={t("title")} data-testid="invite-url" className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm" />
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()} data-testid="invite-copy">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("privacy")}</p>
      {data.invited.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border" data-testid="invite-list">
          {data.invited.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <span className="text-xs text-muted-foreground">{day(p.joinedAt)}</span>
              <span className="flex gap-3 text-xs">
                {step(true, t("stepJoined"))}
                {step(p.steps.workspace, t("stepWorkspace"))}
                {step(p.steps.people, t("stepPeople"))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
