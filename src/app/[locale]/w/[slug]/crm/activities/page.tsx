import { ActivitiesView } from "@/features/crm/ActivitiesView";
import { crmContext } from "@/features/crm/server";

export const dynamic = "force-dynamic";

export default async function ActivitiesPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await crmContext((await params).slug);
  return <ActivitiesView workspaceId={ctx.workspaceId} slug={ctx.slug} canWrite={ctx.canWrite} meId={ctx.userId} />;
}
