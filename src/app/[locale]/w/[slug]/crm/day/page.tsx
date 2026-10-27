import { crmContext } from "@/features/crm/server";
import { DayPlan } from "@/features/crm/DayPlan";

export const dynamic = "force-dynamic";

export default async function DayPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await crmContext((await params).slug);
  return <DayPlan workspaceId={ctx.workspaceId} slug={ctx.slug} canWrite={ctx.canWrite} canExport={ctx.canExport} canErase={ctx.canErase} meId={ctx.userId} />;
}
