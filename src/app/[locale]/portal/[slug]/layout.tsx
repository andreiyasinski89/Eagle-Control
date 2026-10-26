import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";
import { DeletionBanner } from "@/components/layout/deletion-banner";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { QueryProvider } from "@/components/query-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Link, redirect } from "@/i18n/navigation";
import { auth, signOut } from "@/server/auth";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** The client portal shell: no sidebar, no workspace tools. Clients, and owners/admins previewing it, only. */
export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return redirect({ href: { pathname: "/sign-in", query: { callbackUrl: `/portal/${slug}` } }, locale });
  const m = await db.membership.findFirst({ where: { userId, workspace: { slug } }, include: { workspace: { select: { name: true } } } });
  if (!m) return redirect({ href: "/", locale });
  // The team works in the app; only owners and admins may look at the portal (as a preview).
  if (m.role !== "CLIENT" && m.role !== "OWNER" && m.role !== "ADMIN") return redirect({ href: `/w/${slug}`, locale });
  const t = await getTranslations("portal");
  return (
    <div className="flex min-h-screen flex-col">
      <DeletionBanner userId={userId} />
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <Link href={`/portal/${slug}`} className="font-semibold">
          🦉 {m.workspace.name}
          {m.role !== "CLIENT" && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal">{t("preview")}</span>}
        </Link>
        <div className="flex items-center gap-2">
          {m.role !== "CLIENT" && (
            <Link href={`/w/${slug}`} className="text-sm text-muted-foreground hover:underline">
              {t("backToApp")}
            </Link>
          )}
          <Link href="/account" className="text-sm text-muted-foreground hover:underline">
            {t("account")}
          </Link>
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
      <QueryProvider>{children}</QueryProvider>
    </div>
  );
}
