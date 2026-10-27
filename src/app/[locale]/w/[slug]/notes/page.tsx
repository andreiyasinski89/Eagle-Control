import { NotesView } from "@/features/notes/NotesView";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function NotesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ws = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  return <NotesView workspaceId={ws.id} />;
}
