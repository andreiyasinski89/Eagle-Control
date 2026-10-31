import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { UiModeAttr } from "@/components/layout/ui-mode-attr";
import { BottomNav } from "@/components/layout/bottom-nav";
import { overlayMessages, resolveUiMode, SIMPLE_TERMS } from "@/modules/ui-mode";
import { personFlags } from "@/server/services/ui-mode";
import { CommandPalette } from "@/components/layout/command-palette";
import { Sidebar, type ShellProps } from "@/components/layout/sidebar";
import { TrialBanner } from "@/components/layout/trial-banner";
import { DeletionBanner } from "@/components/layout/deletion-banner";
import { Topbar } from "@/components/layout/topbar";
import { QueryProvider } from "@/components/query-provider";
import { getSession } from "@/server/session";
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
  const session = await getSession();
  const userId = session?.user?.id;
  if (!userId) return redirect({ href: { pathname: "/sign-in", query: { callbackUrl: `/w/${slug}` } }, locale });

  // Three independent questions to the database, asked together: every question is a trip there, and the trips used to be taken one after another.
  const [membership, workspaces, me] = await Promise.all([
    db.membership.findFirst({ where: { userId, workspace: { slug } }, include: { workspace: { select: { id: true, slug: true, name: true } } } }),
    listWorkspacesForUser(userId),
    personFlags(userId),
  ]);
  if (!membership) return redirect({ href: "/", locale });
  if (membership.role === "CLIENT") return redirect({ href: `/portal/${slug}`, locale }); // clients never see the workspace app

  const mode = resolveUiMode(me?.uiMode, !!me?.referredById);
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
          <DeletionBanner requestedAt={me?.deletionRequestedAt ?? null} />
          <TrialBanner workspaceId={membership.workspace.id} slug={slug} isOwner={membership.role === "OWNER"} />
          <Topbar current={membership.workspace} shell={shell} />
          <main className={shell.showCrm ? "min-w-0 flex-1 pb-20 md:pb-0" : "min-w-0 flex-1"}>{children}</main>
        </div>
      </div>
      {shell.showCrm && <BottomNav slug={slug} workspaceId={membership.workspace.id} />}
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
