import { BillingPanel } from "@/features/settings/BillingPanel";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function BillingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const ws = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  return <BillingPanel workspaceId={ws.id} checkout={sp.checkout ?? null} />;
}
