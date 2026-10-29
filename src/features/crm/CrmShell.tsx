"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function CrmProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

export function CrmTabs({ slug, full = true }: { slug: string; full?: boolean }) {
  const t = useTranslations("crm");
  const pathname = usePathname();
  const base = `/w/${slug}/crm`;
  const tabs = [
    { href: `${base}/day`, label: t("tabDay") },
    { href: `${base}/touches`, label: t("tabTouches") },
    { href: `${base}/people`, label: t("tabPeople") },
    { href: `${base}/team`, label: t("tabTeam") },
    { href: `${base}/team-activity`, label: t("tabTeamActivity") },
    { href: `${base}/network`, label: t("tabNetwork") },
    ...(full ? [{ href: base, label: t("tabPipeline"), exact: true }, { href: `${base}/companies`, label: t("tabCompanies") }] : []),
    { href: `${base}/contacts`, label: t("tabContacts") },
    ...(full ? [{ href: `${base}/activities`, label: t("tabActivities") }] : []),
    { href: `${base}/scripts`, label: t("tabScripts") },
  ];
  return (
    <nav aria-label="CRM" className="flex gap-1 overflow-x-auto border-b border-border bg-card px-4">
      {tabs.map((x) => {
        const active = x.exact ? pathname === x.href : pathname.startsWith(x.href);
        return (
          <Link key={x.href} href={x.href} aria-current={active ? "page" : undefined} className={cn("shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm", active ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {x.label}
          </Link>
        );
      })}
    </nav>
  );
}
