import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/server/policies";
import { listTeams } from "@/server/services/teams";
import { TeamsPanel } from "@/features/teams/TeamsPanel";

export const dynamic = "force-dynamic";

export default async function TeamsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  const t = await getTranslations("teams");
  const workspace = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  const me = await db.membership.findUnique({ where: { userId_workspaceId: { userId: session?.user?.id ?? "", workspaceId: workspace.id } } });
  if (!me || !can(me, "member:invite")) notFound();
  const [teams, people] = await Promise.all([
    listTeams(me.userId, workspace.id),
    db.membership.findMany({ where: { workspaceId: workspace.id, role: { in: ["OWNER", "ADMIN", "MEMBER"] } }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  return (
    <section className="max-w-3xl p-6">
      <h1 className="mb-1 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-4 text-sm text-muted-foreground">{t("hint")}</p>
      <TeamsPanel workspaceId={workspace.id} teams={teams} people={people.map((p) => ({ userId: p.userId, name: p.user.name ?? p.user.email }))} />
    </section>
  );
}
