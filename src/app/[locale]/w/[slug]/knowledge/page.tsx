import { KnowledgeView } from "@/features/kb/KnowledgeView";

export const dynamic = "force-dynamic";

export default async function KnowledgePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <KnowledgeView slug={slug} />;
}
