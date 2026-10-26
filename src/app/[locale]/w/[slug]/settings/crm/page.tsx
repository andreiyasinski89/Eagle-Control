import { notFound } from "next/navigation";
import { CrmProviders } from "@/features/crm/CrmShell";
import { CrmSettings } from "@/features/crm/CrmSettings";
import { crmContext } from "@/features/crm/server";

export const dynamic = "force-dynamic";

export default async function CrmSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await crmContext((await params).slug);
  if (!ctx.canManagePipelines) notFound();
  return (
    <CrmProviders>
      <CrmSettings workspaceId={ctx.workspaceId} />
    </CrmProviders>
  );
}
