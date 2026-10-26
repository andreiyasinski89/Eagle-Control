"use client";

import { CalendarDays, FolderKanban, Handshake, LayoutDashboard, BarChart3, Clock, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function Sidebar({ slug, showCrm }: { slug: string; showCrm: boolean }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const base = `/w/${slug}`;
  const items = [
    { href: base, label: t("myDay"), icon: LayoutDashboard, exact: true },
    { href: `${base}/projects`, label: t("projects"), icon: FolderKanban },
    ...(showCrm ? [{ href: `${base}/crm`, label: t("crm"), icon: Handshake }] : []),
    { href: `${base}/calendar`, label: t("calendar"), icon: CalendarDays },
    { href: `${base}/time`, label: t("time"), icon: Clock },
    { href: `${base}/reports`, label: t("reports"), icon: BarChart3 },
    { href: `${base}/settings/members`, label: t("settings"), icon: Settings },
  ];
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-border bg-card p-3" aria-label="Main">
      {items.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href.replace(/\/members$/, ""));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted",
              active && "bg-muted font-medium",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
