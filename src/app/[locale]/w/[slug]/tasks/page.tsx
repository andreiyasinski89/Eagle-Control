import { MyTasksView } from "@/features/views/MyTasksView";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function TasksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ws = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  return <MyTasksView workspaceId={ws.id} slug={slug} />;
}
