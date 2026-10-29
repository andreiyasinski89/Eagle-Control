import { crmContext } from "@/features/crm/server";
import { MaterialsView } from "@/features/crm/MaterialsView";

export const dynamic = "force-dynamic";

export default async function MaterialsPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await crmContext((await params).slug);
  return <MaterialsView workspaceId={ctx.workspaceId} />;
}
