import { CompanyPage } from "@/features/crm/CompanyPage";
import { crmContext } from "@/features/crm/server";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({ params, searchParams }: { params: Promise<{ slug: string; companyId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ slug, companyId }, { tab }] = await Promise.all([params, searchParams]);
  const ctx = await crmContext(slug);
  return <CompanyPage workspaceId={ctx.workspaceId} slug={slug} companyId={companyId} canWrite={ctx.canWrite} meId={ctx.userId} initialTab={tab === "map" ? "map" : tab === "time" ? "time" : "overview"} />;
}
