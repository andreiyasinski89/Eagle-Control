import { NotificationSettings } from "@/features/settings/NotificationSettings";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ws = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  return <NotificationSettings workspaceId={ws.id} />;
}
