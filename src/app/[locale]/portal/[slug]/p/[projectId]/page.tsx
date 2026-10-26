import { PortalProject } from "@/features/portal/PortalProject";

export const dynamic = "force-dynamic";

export default async function PortalProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <PortalProject projectId={projectId} />;
}
