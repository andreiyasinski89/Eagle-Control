import { notFound } from "next/navigation";
import { CrmProviders, CrmTabs } from "@/features/crm/CrmShell";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/server/policies";

export const dynamic = "force-dynamic";

export default async function CrmLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  const membership = await db.membership.findFirst({ where: { userId: session?.user?.id ?? "", workspace: { slug } } });
  // Without the CRM flag the section does not exist for this person.
  if (!membership || !can(membership, "crm:read")) notFound();
  return (
    <CrmProviders>
      <div className="flex h-[calc(100vh-3.5rem)] min-h-0 flex-col">
        <CrmTabs slug={slug} />
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </CrmProviders>
  );
}
