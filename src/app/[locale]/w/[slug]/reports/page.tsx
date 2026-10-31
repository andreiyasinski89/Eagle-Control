import { getUiMode } from "@/server/services/ui-mode";
import { ReportsView } from "@/features/reports/ReportsView";
import { hasFeature } from "@/modules/plans";
import { getSession } from "@/server/session";
import { db } from "@/server/db";
import { can } from "@/server/policies";
import { listProjects } from "@/server/services/nodes/queries";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  const userId = session?.user?.id ?? "";
  const workspace = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true, plan: true } });
  const membership = await db.membership.findUniqueOrThrow({ where: { userId_workspaceId: { userId, workspaceId: workspace.id } } });
  // The sprint charts (velocity, burndown) are for agile teams: the simple mode leaves them out.
  const canSeeAgile = membership.role !== "CLIENT" && (await getUiMode(userId)).mode !== "simple";
  const projects = canSeeAgile ? await listProjects(userId, workspace.id) : [];
  return (
    <ReportsView
      workspaceId={workspace.id}
      hasMetrics={hasFeature(workspace.plan, "metrics")}
      canCrm={can(membership, "crm:full")}
      canExport={can(membership, "crm:export")}
      canSeeAgile={canSeeAgile}
      projects={projects.map((p) => ({ id: p.id, title: p.title }))}
    />
  );
}
