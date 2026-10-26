import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";
import { signOut } from "@/server/auth";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/layout/notification-bell";
import { TimerChip } from "@/components/layout/timer-chip";

interface Props {
  current: { slug: string; name: string; id: string };
  workspaces: { slug: string; name: string }[];
}

export async function Topbar({ current, workspaces }: Props) {
  const t = await getTranslations("nav");
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-3">
        <span className="font-semibold">🦉 {current.name}</span>
        {workspaces.length > 1 && (
          <div className="flex gap-2 text-sm text-muted-foreground">
            {workspaces
              .filter((w) => w.slug !== current.slug)
              .map((w) => (
                <Link key={w.slug} href={`/w/${w.slug}`} className="hover:underline">
                  {w.name}
                </Link>
              ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <TimerChip />
        <NotificationBell workspaceId={current.id} slug={current.slug} />
        <LocaleSwitcher />
        <ThemeToggle />
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <Button variant="ghost" size="sm" type="submit">
            <LogOut className="size-4" />
            {t("signOut")}
          </Button>
        </form>
      </div>
    </header>
  );
}
