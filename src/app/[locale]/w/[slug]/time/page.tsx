import { TimeView } from "@/features/time/TimeView";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function TimePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ws = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  return <TimeView workspaceId={ws.id} slug={slug} />;
}
