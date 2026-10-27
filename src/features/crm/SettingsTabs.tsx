"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function SettingsTabs({ slug, showCrm, showLeads, showTeams = false }: { slug: string; showCrm: boolean; showLeads: boolean; showTeams?: boolean }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const base = `/w/${slug}/settings`;
  const tabs = [{ href: `${base}/members`, label: t("members") }, ...(showTeams ? [{ href: `${base}/teams`, label: t("teams") }] : []), { href: `${base}/notifications`, label: t("notifications") }, { href: `${base}/integrations`, label: t("integrations") }, { href: `${base}/billing`, label: t("billing") }, { href: `${base}/developers`, label: t("developers") }, { href: "/account", label: t("account") }, ...(showCrm ? [{ href: `${base}/crm`, label: t("crmSettings") }] : []), ...(showLeads ? [{ href: `${base}/lead-capture`, label: t("leadCapture") }] : [])];
  return (
    <nav aria-label={t("settings")} className="flex gap-1 overflow-x-auto border-b border-border bg-card px-4 max-sm:[mask-image:linear-gradient(to_right,#000_calc(100%-32px),transparent)]">
      {tabs.map((x) => (
        <Link key={x.href} href={x.href} aria-current={pathname === x.href ? "page" : undefined} className={cn("shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm", pathname === x.href ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
          {x.label}
        </Link>
      ))}
    </nav>
  );
}
