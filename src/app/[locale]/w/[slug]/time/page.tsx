import { Timesheet } from "@/features/time/Timesheet";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function TimePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ws = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  return <Timesheet workspaceId={ws.id} slug={slug} />;
}
