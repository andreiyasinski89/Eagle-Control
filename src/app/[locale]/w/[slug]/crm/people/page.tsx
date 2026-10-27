import { PeopleBoard } from "@/features/crm/PeopleBoard";
import { crmContext } from "@/features/crm/server";

export const dynamic = "force-dynamic";

export default async function PeoplePage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await crmContext((await params).slug);
  return <PeopleBoard workspaceId={ctx.workspaceId} slug={ctx.slug} canWrite={ctx.canWrite} canExport={ctx.canExport} canErase={ctx.canErase} meId={ctx.userId} />;
}
