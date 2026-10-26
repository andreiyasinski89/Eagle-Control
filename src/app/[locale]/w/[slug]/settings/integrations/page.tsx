import { getTranslations } from "next-intl/server";
import { IntegrationsPanel } from "@/features/settings/IntegrationsPanel";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ connected?: string; error?: string }> }) {
  const [{ slug }, sp, t] = await Promise.all([params, searchParams, getTranslations("integrations")]);
  const ws = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  const banner = sp.connected === "google" || sp.connected === "slack" ? { kind: "connected" as const, text: t("justConnected", { name: sp.connected === "google" ? t("google.title") : t("slack.title") }) } : sp.error ? { kind: "error" as const, text: t("failed", { code: sp.error }) } : null;
  return <IntegrationsPanel workspaceId={ws.id} banner={banner} />;
}
