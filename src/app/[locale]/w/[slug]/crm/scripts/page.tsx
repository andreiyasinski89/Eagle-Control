import { crmContext } from "@/features/crm/server";
import { ScriptsView } from "@/features/crm/ScriptsView";

export const dynamic = "force-dynamic";

export default async function ScriptsPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await crmContext((await params).slug);
  return <ScriptsView workspaceId={ctx.workspaceId} canWrite={ctx.canWrite} />;
}
