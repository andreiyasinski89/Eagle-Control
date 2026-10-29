"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronsUpDown, LogOut, Menu, Plus, Settings, ShieldCheck, User, X } from "lucide-react";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { OPEN_MENU_EVENT } from "./bottom-nav";
import { initialsOf, navGroups } from "./nav";

export interface ShellProps {
  slug: string;
  showCrm: boolean;
  workspaces: { slug: string; name: string }[];
  user: { name: string | null; email: string; isSuperAdmin?: boolean };
}

function Avatar({ label, className }: { label: string; className?: string }) {
  return (
    <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-xs font-semibold text-accent-foreground", className)}>
      {label}
    </span>
  );
}

function WorkspaceSwitcher({ slug, workspaces }: Pick<ShellProps, "slug" | "workspaces">) {
  const t = useTranslations("shell");
  const current = workspaces.find((w) => w.slug === slug) ?? workspaces[0];
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <button
          type="button"
          aria-label={t("switchWorkspace")}
          className="flex w-full items-center gap-2 rounded-xl border border-border bg-card p-2 text-left hover:bg-muted"
          data-testid="workspace-switcher"
        >
          <Avatar label={(current?.name ?? "?").slice(0, 2).toUpperCase()} className="bg-primary text-primary-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{current?.name}</span>
            <span className="block text-xs text-muted-foreground">{t("workspace")}</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownTrigger>
      <DropdownContent align="start" className="w-64">
        <DropdownLabel>{t("workspaces")}</DropdownLabel>
        {workspaces.map((w) => (
          <DropdownItem key={w.slug} asChild>
            <Link href={`/w/${w.slug}`}>
              <Avatar label={w.name.slice(0, 2).toUpperCase()} className="size-6 rounded-md text-[10px]" />
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              {w.slug === slug && <Check className="size-4 text-primary" />}
            </Link>
          </DropdownItem>
        ))}
        <DropdownSeparator />
        <DropdownItem asChild>
          <Link href="/onboarding">
            <Plus className="size-4" />
            {t("newWorkspace")}
          </Link>
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}

function UserMenu({ user }: Pick<ShellProps, "user">) {
  const t = useTranslations("shell");
  const label = initialsOf(user.name, user.email);
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <button
          type="button"
          aria-label={t("userMenu")}
          className="flex w-full items-center gap-2 rounded-xl p-2 text-left hover:bg-muted"
          data-testid="user-menu"
        >
          <Avatar label={label} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name ?? user.email}</span>
            {user.name && <span className="block truncate text-xs text-muted-foreground">{user.email}</span>}
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownTrigger>
      <DropdownContent align="start" side="top" className="w-60">
        <DropdownItem asChild>
          <Link href="/account">
            <User className="size-4" />
            {t("account")}
          </Link>
        </DropdownItem>
        {user.isSuperAdmin && (
          <DropdownItem asChild>
            <Link href="/admin" data-testid="admin-link">
              <ShieldCheck className="size-4" />
              {t("admin")}
            </Link>
          </DropdownItem>
        )}
        <DropdownSeparator />
        <DropdownItem onSelect={() => void signOut({ redirectTo: "/" })} data-testid="sign-out">
          <LogOut className="size-4" />
          {t("signOut")}
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}

function SidebarBody({ slug, showCrm, workspaces, user, onNavigate }: ShellProps & { onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const groups = navGroups(slug, showCrm, t);
  const settings = {
    href: `/w/${slug}/settings/members`,
    label: t("settings"),
    icon: Settings,
    exact: false,
  };
  const link = ({ href, label, icon: Icon, exact }: { href: string; label: string; icon: typeof Settings; exact?: boolean }) => {
    const active = exact ? pathname === href : pathname.startsWith(href.replace(/\/members$/, ""));
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          active && "bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <Icon className="size-4" />
        {label}
      </Link>
    );
  };
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <WorkspaceSwitcher slug={slug} workspaces={workspaces} />
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto" aria-label="Main">
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-0.5">
            <span className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">{g.label}</span>
            {g.items.map(link)}
          </div>
        ))}
      </nav>
      <div className="flex flex-col gap-1 border-t border-border pt-3">
        {link(settings)}
        <UserMenu user={user} />
      </div>
    </div>
  );
}

/** Fixed on the left from tablet width up. */
export function Sidebar(props: ShellProps) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-border bg-sidebar md:block">
      <SidebarBody {...props} />
    </aside>
  );
}

/** The menu button and slide-in drawer for phones. */
export function MobileNav(props: ShellProps) {
  const t = useTranslations("shell");
  const [open, setOpen] = useState(false);
  // The "More" button of the bottom bar opens the same menu.
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_MENU_EVENT, show);
    return () => window.removeEventListener(OPEN_MENU_EVENT, show);
  }, []);
  return (
    <>
      <button
        type="button"
        aria-label={t("menu")}
        onClick={() => setOpen(true)}
        className="grid size-11 place-items-center rounded-lg hover:bg-muted md:hidden"
        data-testid="mobile-menu"
      >
        <Menu className="size-5" />
      </button>
      {/* In a portal: the top bar blurs what is behind it, and a blurred ancestor would trap a fixed drawer inside the bar. */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label={t("menu")}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-sidebar shadow-2xl">
              <div className="flex justify-end px-2 pt-2">
                <button
                  type="button"
                  aria-label={t("close")}
                  onClick={() => setOpen(false)}
                  className="grid size-11 place-items-center rounded-lg hover:bg-muted"
                >
                  <X className="size-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <SidebarBody {...props} onNavigate={() => setOpen(false)} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
