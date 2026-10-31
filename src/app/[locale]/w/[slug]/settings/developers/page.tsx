import { DevelopersPanel } from "@/features/settings/DevelopersPanel";
import { getSession } from "@/server/session";
import { db } from "@/server/db";
import { can } from "@/server/policies";

export const dynamic = "force-dynamic";

export default async function DevelopersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  const ws = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  const m = await db.membership.findUniqueOrThrow({ where: { userId_workspaceId: { userId: session?.user?.id ?? "", workspaceId: ws.id } } });
  return <DevelopersPanel workspaceId={ws.id} canManageHooks={can(m, "member:invite")} />;
}
