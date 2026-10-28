import { notFound } from "next/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { QueryProvider } from "@/components/query-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { PlatformSetup } from "@/features/admin/PlatformSetup";
import { Link, redirect } from "@/i18n/navigation";
import { auth } from "@/server/auth";
import { isSuperAdminEmail } from "@/server/services/admin";

export const dynamic = "force-dynamic";

/** The platform owner's checklist for connecting outside services. For everyone else it does not exist. */
export default async function PlatformSetupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user?.id) return redirect({ href: { pathname: "/sign-in", query: { callbackUrl: "/admin/setup" } }, locale });
  if (!isSuperAdminEmail(session.user.email)) notFound();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <Link href="/" className="font-semibold">
          🦉 MeetOwl
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
            ←
          </Link>
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <QueryProvider>
        <PlatformSetup />
      </QueryProvider>
    </div>
  );
}
