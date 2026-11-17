"use client";

import { useState } from "react";
import { ProLock } from "@/components/pro-lock";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { AgileReports } from "./AgileReports";
import { CrmReports } from "./CrmReports";

interface Props {
  workspaceId: string;
  hasMetrics: boolean;
  canCrm: boolean;
  canExport: boolean;
  canSeeAgile: boolean;
  projects: { id: string; title: string }[];
}

export function ReportsView({ workspaceId, hasMetrics, canCrm, canExport, canSeeAgile, projects }: Props) {
  const t = useTranslations("reports");
  const tabs = [...(canSeeAgile ? (["agile"] as const) : []), ...(canCrm ? (["crm"] as const) : [])];
  const [tab, setTab] = useState<(typeof tabs)[number]>(tabs[0] ?? "agile");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <div className="ml-auto flex gap-1 rounded-lg border border-border bg-card p-1 text-sm" role="tablist">
          {tabs.map((x) => (
            <button key={x} role="tab" aria-selected={tab === x} data-testid={`reports-tab-${x}`} onClick={() => setTab(x)} className={cn("rounded-md px-3 py-1", tab === x ? "bg-muted font-medium" : "text-muted-foreground")}>
              {t(`tab.${x}`)}
            </button>
          ))}
        </div>
      </div>
      {tabs.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("nothing")}</p>
      ) : !hasMetrics ? (
        <ProLock title={t("paywallTitle")} text={tab === "agile" ? t("paywallAgile") : t("paywallCrm")} />
      ) : tab === "agile" ? (
        <AgileReports projects={projects} />
      ) : (
        <CrmReports workspaceId={workspaceId} canExport={canExport} />
      )}
    </div>
  );
}
