import { redirect } from "@/i18n/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { DeletionBanner } from "@/components/layout/deletion-banner";
import { Topbar } from "@/components/layout/topbar";
import { QueryProvider } from "@/components/query-provider";
import { auth } from "@/server/auth";
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
  return (
    <div className="flex min-h-screen flex-col">
      <DeletionBanner userId={userId} />
      <Topbar current={membership.workspace} workspaces={workspaces} />
      <div className="flex flex-1">
        <Sidebar slug={slug} showCrm={can(membership, "crm:read")} />
        <main className="min-w-0 flex-1">
          <QueryProvider>{children}</QueryProvider>
        </main>
      </div>
    </div>
  );
}
