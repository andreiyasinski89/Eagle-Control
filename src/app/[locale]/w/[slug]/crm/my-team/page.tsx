import { crmContext } from "@/features/crm/server";
import { TeamMap } from "@/features/crm/TeamMap";

export const dynamic = "force-dynamic";

export default async function MyTeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await crmContext((await params).slug);
  return <TeamMap workspaceId={ctx.workspaceId} slug={ctx.slug} canWrite={ctx.canWrite} canExport={ctx.canExport} canErase={ctx.canErase} canLead={ctx.canLead} meId={ctx.userId} />;
}
