"use client";

import { useState } from "react";
import { CalendarCheck, Menu, Plus, Send, UserRound, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { QuickAddContact } from "@/features/crm/QuickAddContact";

/** Asked of the slide-in menu (MobileNav listens for it). */
export const OPEN_MENU_EVENT = "meetowl:open-menu";

/**
 * On a phone: the five places an ambassador is in all day, at the thumb, and a round "+" above them for adding a person on the spot.
 * Hidden from tablet width up, where the sidebar does the job. Only for those who have the CRM.
 */
export function BottomNav({ slug, workspaceId }: { slug: string; workspaceId: string }) {
  const t = useTranslations("mobile");
  const pathname = usePathname();
  const [adding, setAdding] = useState(false);
  const base = `/w/${slug}`;
  const items = [
    { href: base, label: t("day"), icon: CalendarCheck, exact: true },
    { href: `${base}/crm/touches`, label: t("touches"), icon: Send },
    { href: `${base}/crm/people`, label: t("contacts"), icon: UserRound },
    { href: `${base}/crm/my-team`, label: t("team"), icon: Users },
  ];
  const cell = "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-tight";
  return (
    <>
      <button
        type="button"
        aria-label={t("quickAdd")}
        onClick={() => setAdding(true)}
        className="fixed bottom-[4.5rem] right-4 z-30 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg md:hidden"
        data-testid="quick-add-fab"
      >
        <Plus className="size-7" />
      </button>
      <nav aria-label={t("nav")} className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden" data-testid="bottom-nav">
        {items.map((i) => {
          const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
          return (
            <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={cn(cell, active ? "font-medium text-primary" : "text-muted-foreground")}>
              <i.icon className="size-5" aria-hidden />
              <span className="max-w-full truncate">{i.label}</span>
            </Link>
          );
        })}
        <button type="button" className={cn(cell, "text-muted-foreground")} onClick={() => window.dispatchEvent(new Event(OPEN_MENU_EVENT))} data-testid="bottom-more">
          <Menu className="size-5" aria-hidden />
          <span>{t("more")}</span>
        </button>
      </nav>
      <QuickAddContact open={adding} onClose={() => setAdding(false)} workspaceId={workspaceId} slug={slug} />
    </>
  );
}
