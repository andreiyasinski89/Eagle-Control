import { crmContext } from "@/features/crm/server";
import { TouchQueue } from "@/features/crm/TouchQueue";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TouchesPage({ params }: { params: Promise<{ slug: string }> }) {
  const ctx = await crmContext((await params).slug);
  if (!ctx.canWrite) notFound();
  return <TouchQueue workspaceId={ctx.workspaceId} slug={ctx.slug} />;
}
