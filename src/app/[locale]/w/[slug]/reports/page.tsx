import { ReportsView } from "@/features/reports/ReportsView";
import { hasFeature } from "@/modules/plans";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/server/policies";
import { listProjects } from "@/server/services/nodes/queries";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? "";
  const workspace = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true, plan: true } });
  const membership = await db.membership.findUniqueOrThrow({ where: { userId_workspaceId: { userId, workspaceId: workspace.id } } });
  const canSeeAgile = membership.role !== "CLIENT";
  const projects = canSeeAgile ? await listProjects(userId, workspace.id) : [];
  return (
    <ReportsView
      workspaceId={workspace.id}
      hasMetrics={hasFeature(workspace.plan, "metrics")}
      canCrm={can(membership, "crm:read")}
      canExport={can(membership, "crm:export")}
      canSeeAgile={canSeeAgile}
      projects={projects.map((p) => ({ id: p.id, title: p.title }))}
    />
  );
}
