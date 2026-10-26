import { CrmProviders } from "@/features/crm/CrmShell";
import { MyDayView } from "@/features/crm/MyDayView";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const workspace = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true, name: true } });
  return (
    <CrmProviders>
      <MyDayView workspaceId={workspace.id} slug={slug} workspaceName={workspace.name} />
    </CrmProviders>
  );
}
