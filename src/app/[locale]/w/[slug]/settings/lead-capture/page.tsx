import { notFound } from "next/navigation";
import { CrmProviders } from "@/features/crm/CrmShell";
import { LeadCaptureSettings } from "@/features/crm/LeadCaptureSettings";
import { crmContext } from "@/features/crm/server";

export const dynamic = "force-dynamic";

export default async function LeadCapturePage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await crmContext((await params).slug);
  if (!ctx.canManageLeads) notFound();
  return (
    <CrmProviders>
      <LeadCaptureSettings workspaceId={ctx.workspaceId} />
    </CrmProviders>
  );
}
