import { SettingsTabs } from "@/features/crm/SettingsTabs";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/server/policies";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  const m = await db.membership.findFirst({ where: { userId: session?.user?.id ?? "", workspace: { slug } } });
  return (
    <>
      <SettingsTabs slug={slug} showCrm={!!m && can(m, "pipeline:manage")} showLeads={!!m && can(m, "leadform:manage")} showTeams={!!m && can(m, "member:invite")} />
      {children}
    </>
  );
}
