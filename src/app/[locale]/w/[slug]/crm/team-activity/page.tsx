import { crmContext } from "@/features/crm/server";
import { TeamActivity } from "@/features/crm/TeamActivity";

export const dynamic = "force-dynamic";

export default async function TeamActivityPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await crmContext((await params).slug);
  return <TeamActivity workspaceId={ctx.workspaceId} slug={ctx.slug} canWrite={ctx.canWrite} canExport={ctx.canExport} canErase={ctx.canErase} meId={ctx.userId} />;
}
