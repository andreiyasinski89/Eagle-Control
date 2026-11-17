import { crmContext } from "@/features/crm/server";
import { getTranslations } from "next-intl/server";
import { NetworkMap } from "@/features/crm/NetworkMap";
import { ProGate } from "@/components/pro-lock";

export const dynamic = "force-dynamic";

export default async function NetworkPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await crmContext((await params).slug);
  const tp = await getTranslations("pro");
  return (
    <ProGate title={tp("networkTitle")} text={tp("networkText")}>
      <NetworkMap workspaceId={ctx.workspaceId} slug={ctx.slug} canWrite={ctx.canWrite} canExport={ctx.canExport} canErase={ctx.canErase} meId={ctx.userId} />
    </ProGate>
  );
}
