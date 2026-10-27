import { crmContext } from "@/features/crm/server";
import { NetworkMap } from "@/features/crm/NetworkMap";

export const dynamic = "force-dynamic";

export default async function NetworkPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await crmContext((await params).slug);
  return <NetworkMap workspaceId={ctx.workspaceId} slug={ctx.slug} canWrite={ctx.canWrite} canExport={ctx.canExport} canErase={ctx.canErase} meId={ctx.userId} />;
}
