import { WorkspaceCalendar } from "@/features/views/WorkspaceCalendar";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ws = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  return <WorkspaceCalendar workspaceId={ws.id} slug={slug} />;
}
