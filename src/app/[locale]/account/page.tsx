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
  const [t, user] = await Promise.all([getTranslations("account"), db.user.findUnique({ where: { id }, select: { email: true, name: true, firstName: true, lastName: true, phone: true, telegram: true, avatar: true, image: true } })]);
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
        <AccountPanel
          email={user.email}
          avatar={user.avatar ?? user.image}
          // Accounts made before the split have only a display name: split it at the first space so nothing looks empty.
          profile={{ firstName: user.firstName ?? (user.lastName ? "" : (user.name ?? "").split(" ")[0] ?? ""), lastName: user.lastName ?? (user.firstName ? "" : (user.name ?? "").split(" ").slice(1).join(" ")), phone: user.phone ?? "", telegram: user.telegram ? `@${user.telegram}` : "" }}
        />
      </QueryProvider>
    </div>
  );
}
