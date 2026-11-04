import { AgentDraftsView } from "@/features/crm/AgentDraftsView";
import { crmContext } from "@/features/crm/server";

export const dynamic = "force-dynamic";

export default async function AgentDraftsPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await crmContext((await params).slug);
  return <AgentDraftsView workspaceId={ctx.workspaceId} slug={ctx.slug} canWrite={ctx.canWrite} />;
}
