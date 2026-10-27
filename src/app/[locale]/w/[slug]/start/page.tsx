import { StartView } from "@/features/start/StartView";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function StartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ws = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  return <StartView workspaceId={ws.id} slug={slug} />;
}
