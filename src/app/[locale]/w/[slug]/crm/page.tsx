import { notFound } from "next/navigation";
import { PipelineBoard } from "@/features/crm/PipelineBoard";
import { getSession } from "@/server/session";
import { db } from "@/server/db";
import { can } from "@/server/policies";

export const dynamic = "force-dynamic";

export default async function PipelinePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  const userId = session?.user?.id ?? "";
  const ws = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  const me = await db.membership.findUniqueOrThrow({ where: { userId_workspaceId: { userId, workspaceId: ws.id } } });
  if (!can(me, "crm:full")) notFound();
  return (
    <div className="h-full">
      <PipelineBoard workspaceId={ws.id} slug={slug} canWrite={can(me, "crm:write")} meId={userId} />
    </div>
  );
}
