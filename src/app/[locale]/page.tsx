import { redirect } from "@/i18n/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await auth();
  if (!session?.user?.id) return redirect({ href: "/sign-in", locale });
  const memberships = await db.membership.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" }, include: { workspace: { select: { slug: true } } } });
  // The team's workspace first; a person who is only a client lands in the portal.
  const team = memberships.find((m) => m.role !== "CLIENT");
  if (team) return redirect({ href: `/w/${team.workspace.slug}`, locale });
  const client = memberships[0];
  return redirect({ href: client ? `/portal/${client.workspace.slug}` : "/onboarding", locale });
}
