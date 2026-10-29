import { CrmProviders } from "@/features/crm/CrmShell";
import { MyDayView } from "@/features/crm/MyDayView";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getUiMode } from "@/server/services/ui-mode";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [workspace, session] = await Promise.all([db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true, name: true } }), auth()]);
  const userId = session?.user?.id ?? "";
  const simple = userId ? (await getUiMode(userId)).mode === "simple" : false;
  return (
    <CrmProviders>
      <MyDayView workspaceId={workspace.id} slug={slug} workspaceName={workspace.name} userName={session?.user?.name ?? null} simple={simple} meId={userId} />
    </CrmProviders>
  );
}
