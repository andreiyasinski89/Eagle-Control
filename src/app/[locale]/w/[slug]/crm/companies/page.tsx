import { CompaniesView } from "@/features/crm/CompaniesView";
import { crmContext } from "@/features/crm/server";

export const dynamic = "force-dynamic";

export default async function CompaniesPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await crmContext((await params).slug, true);
  return <CompaniesView workspaceId={ctx.workspaceId} slug={ctx.slug} canWrite={ctx.canWrite} canExport={ctx.canExport} canMerge={ctx.canMerge} />;
}
