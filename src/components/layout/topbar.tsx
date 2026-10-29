import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { SearchButton } from "@/components/layout/command-palette";
import { NotificationBell } from "@/components/layout/notification-bell";
import { MobileNav, type ShellProps } from "@/components/layout/sidebar";
import { TimerChip } from "@/components/layout/timer-chip";

/** Search on the left, the things you glance at on the right. Workspace and account live in the sidebar. */
export function Topbar({ current, shell }: { current: { id: string; slug: string }; shell: ShellProps }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur md:px-5">
      <MobileNav {...shell} />
      <SearchButton />
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <TimerChip workspaceId={current.id} />
        <NotificationBell workspaceId={current.id} slug={current.slug} />
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
