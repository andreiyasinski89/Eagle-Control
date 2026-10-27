import { crmContext } from "@/features/crm/server";
import { TeamView } from "@/features/crm/TeamView";

export const dynamic = "force-dynamic";

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await crmContext((await params).slug);
  return <TeamView workspaceId={ctx.workspaceId} slug={ctx.slug} canWrite={ctx.canWrite} canExport={ctx.canExport} canErase={ctx.canErase} meId={ctx.userId} />;
}
