import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/server/policies";
import { listInvitations } from "@/server/services/invitation";
import { listMembers } from "@/server/services/membership";
import { MembersPanel } from "./members-panel";

export const dynamic = "force-dynamic";

export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  const t = await getTranslations("members");
  const workspace = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  const me = await db.membership.findUniqueOrThrow({
    where: { userId_workspaceId: { userId: session?.user?.id ?? "", workspaceId: workspace.id } },
  });
  const canManage = can(me, "member:invite");
  const [members, invitations] = await Promise.all([
    listMembers(workspace.id),
    canManage ? listInvitations(workspace.id) : Promise.resolve([]),
  ]);
  return (
    <section className="max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">{t("title")}</h1>
      <MembersPanel
        workspaceId={workspace.id}
        meId={me.userId}
        canManage={canManage}
        isOwner={me.role === "OWNER"}
        members={members.map((m) => ({
          userId: m.userId,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
          crmAccess: m.crmAccess,
          hourlyRate: canManage ? (m.hourlyRate === null ? null : Number(m.hourlyRate)) : null,
        }))}
        invitations={invitations.map((i) => ({ id: i.id, email: i.email, role: i.role }))}
      />
    </section>
  );
}
