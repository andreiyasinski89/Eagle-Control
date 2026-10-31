import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { MindMapView } from "@/features/mindmap/MindMapView";
import type { TreePayload } from "@/features/mindmap/types";
import { getSession } from "@/server/session";
import { ApiError } from "@/server/http/errors";
import { getTree } from "@/server/services/nodes/queries";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ locale: string; slug: string; projectId: string }> }) {
  const { locale, slug, projectId } = await params;
  const session = await getSession();
  if (!session?.user?.id) return redirect({ href: "/sign-in", locale });

  let payload: TreePayload;
  try {
    // JSON round-trip turns Dates into ISO strings, which is what the client store expects.
    payload = JSON.parse(JSON.stringify(await getTree(session.user.id, projectId))) as TreePayload;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  return <MindMapView payload={payload} backHref={`/w/${slug}/projects`} />;
}
