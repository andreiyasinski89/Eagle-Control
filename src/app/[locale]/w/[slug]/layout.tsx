import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { UiModeAttr } from "@/components/layout/ui-mode-attr";
import { overlayMessages, SIMPLE_TERMS } from "@/modules/ui-mode";
import { getUiMode } from "@/server/services/ui-mode";
import { CommandPalette } from "@/components/layout/command-palette";
import { Sidebar, type ShellProps } from "@/components/layout/sidebar";
import { TrialBanner } from "@/components/layout/trial-banner";
import { DeletionBanner } from "@/components/layout/deletion-banner";
import { Topbar } from "@/components/layout/topbar";
import { QueryProvider } from "@/components/query-provider";
import { auth } from "@/server/auth";
import { isSuperAdminEmail } from "@/server/services/admin";
import { db } from "@/server/db";
import { can } from "@/server/policies";
import { listWorkspacesForUser } from "@/server/services/workspace";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return redirect({ href: { pathname: "/sign-in", query: { callbackUrl: `/w/${slug}` } }, locale });

  const membership = await db.membership.findFirst({
    where: { userId, workspace: { slug } },
    include: { workspace: { select: { id: true, slug: true, name: true } } },
  });
  if (!membership) return redirect({ href: "/", locale });
  if (membership.role === "CLIENT") return redirect({ href: `/portal/${slug}`, locale }); // clients never see the workspace app

  const workspaces = await listWorkspacesForUser(userId);
  const { mode } = await getUiMode(userId);
  const simple = mode === "simple";
  // The simple mode changes the words of the work tree only: the same messages with a few lines put over them.
  const messages = simple ? overlayMessages((await getMessages()) as Record<string, unknown>, SIMPLE_TERMS[(locale in SIMPLE_TERMS ? locale : "en") as keyof typeof SIMPLE_TERMS]) : null;
  const shell: ShellProps = { slug, showCrm: can(membership, "crm:read"), workspaces, user: { name: session?.user?.name ?? null, email: session?.user?.email ?? "", isSuperAdmin: isSuperAdminEmail(session?.user?.email) } };
  const body = (
    <QueryProvider>
      <UiModeAttr mode={mode} />
      <div className="flex min-h-screen" data-ui-mode={mode}>
        <Sidebar {...shell} />
        <div className="flex min-w-0 flex-1 flex-col">
          <DeletionBanner userId={userId} />
          <TrialBanner workspaceId={membership.workspace.id} slug={slug} isOwner={membership.role === "OWNER"} />
          <Topbar current={membership.workspace} shell={shell} />
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
      <CommandPalette workspaceId={membership.workspace.id} {...shell} />
    </QueryProvider>
  );
  return messages ? (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {body}
    </NextIntlClientProvider>
  ) : (
    body
  );
}
