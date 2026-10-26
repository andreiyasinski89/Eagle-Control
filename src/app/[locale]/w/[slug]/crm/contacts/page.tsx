import { ContactsView } from "@/features/crm/ContactsView";
import { crmContext } from "@/features/crm/server";

export const dynamic = "force-dynamic";

export default async function ContactsPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await crmContext((await params).slug);
  return <ContactsView workspaceId={ctx.workspaceId} slug={ctx.slug} canWrite={ctx.canWrite} canExport={ctx.canExport} canMerge={ctx.canMerge} canErase={ctx.canErase} meId={ctx.userId} />;
}
