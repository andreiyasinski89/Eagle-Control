import { getTranslations } from "next-intl/server";
import { LogOut } from "lucide-react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { QueryProvider } from "@/components/query-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { AccountPanel } from "@/features/account/AccountPanel";
import { Link, redirect } from "@/i18n/navigation";
import { auth, signOut } from "@/server/auth";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Your own account, outside any workspace: clients and guests have one too. */
export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return redirect({ href: { pathname: "/sign-in", query: { callbackUrl: "/account" } }, locale });
  const [t, user] = await Promise.all([getTranslations("account"), db.user.findUnique({ where: { id }, select: { email: true, name: true } })]);
  if (!user) return redirect({ href: "/sign-in", locale });
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <Link href="/" className="font-semibold">
          🦉 MeetOwl
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            {t("back")}
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
      <QueryProvider>
        <AccountPanel email={user.email} name={user.name} />
      </QueryProvider>
    </div>
  );
}
