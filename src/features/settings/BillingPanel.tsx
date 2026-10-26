"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { api, ApiFailure } from "@/features/mindmap/api";
import { SkeletonRows } from "@/components/ui/skeleton";

interface Billing {
  configured: boolean;
  canManage: boolean;
  plan: "FREE" | "PRO" | "ENTERPRISE";
  status: string;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  pastDue: boolean;
  graceEndsAt: string | null;
  graceExpired: boolean;
  hasCustomer: boolean;
  granted: boolean;
  usage: Record<string, { used: number; limit: number | null }>;
}

/** Plan, limits, and the two buttons that hand over to Stripe. The plan itself only ever changes through Stripe's webhook. */
export function BillingPanel({ workspaceId, checkout }: { workspaceId: string; checkout: string | null }) {
  const t = useTranslations("billing");
  const locale = useLocale();
  const base = `/api/v1/workspaces/${workspaceId}/billing`;
  const { data, isLoading } = useQuery({ queryKey: ["billing", workspaceId], queryFn: () => api.get<Billing>(base), refetchInterval: checkout === "success" ? 3000 : false });
  const [error, setError] = useState<string | null>(null);
  const go = async (path: "checkout" | "portal") => {
    setError(null);
    try {
      const { url } = await api.post<{ url: string }>(`${base}/${path}`);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : t("error"));
    }
  };
  if (isLoading || !data) return <div className="mx-auto max-w-2xl p-6"><SkeletonRows rows={5} /></div>;
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale) : "—");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      {checkout === "success" && data.plan === "FREE" && <p role="status" className="text-sm">{t("waiting")}</p>}
      {checkout === "success" && data.plan !== "FREE" && <p role="status" className="text-sm">{t("thanks")}</p>}
      {data.pastDue && (
        <p role="alert" data-testid="past-due" className="rounded-md bg-[var(--health-red)]/15 px-3 py-2 text-sm">
          {data.graceExpired ? t("graceExpired") : t("pastDue", { date: date(data.graceEndsAt) })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">{t("plan")}</div>
            <div className="text-2xl font-semibold" data-testid="plan">
              {t(`plans.${data.plan}`)}
            </div>
            {data.renewsAt && data.plan !== "FREE" && <div className="text-xs text-muted-foreground">{data.cancelAtPeriodEnd ? t("endsOn", { date: date(data.renewsAt) }) : t("renewsOn", { date: date(data.renewsAt) })}</div>}
          </div>
          {data.canManage && data.configured && (
            <div className="flex gap-2">
              {data.plan === "FREE" && <Button onClick={() => void go("checkout")}>{t("upgrade")}</Button>}
              {data.hasCustomer && (
                <Button variant="outline" onClick={() => void go("portal")}>
                  {t("manage")}
                </Button>
              )}
            </div>
          )}
        </div>
        {data.granted && (
          <p className="mt-3 text-sm text-muted-foreground" data-testid="plan-granted">
            {t("granted")}
          </p>
        )}
        {!data.configured && !data.granted && <p className="mt-3 text-sm text-muted-foreground">{t("notConfigured")}</p>}
        {!data.canManage && <p className="mt-3 text-sm text-muted-foreground">{t("ownerOnly")}</p>}
      </section>
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">{t("limits")}</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {Object.entries(data.usage).map(([k, v]) => (
            <li key={k} className="grid grid-cols-[8rem_1fr_auto] items-center gap-2">
              <span className="text-muted-foreground">{t(`limit.${k}`)}</span>
              <span className="h-2 rounded bg-muted">
                <span className="block h-full rounded bg-primary" style={{ width: v.limit ? `${Math.min(100, (v.used / v.limit) * 100)}%` : "8%" }} />
              </span>
              <span className="tabular-nums">{v.limit === null ? t("unlimited", { n: v.used }) : `${v.used} / ${v.limit}`}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
