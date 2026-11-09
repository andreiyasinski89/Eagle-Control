import { redirect } from "@/i18n/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Where an app-icon shortcut ("/?to=touches") leads inside the person's workspace. */
const SHORTCUTS: Record<string, string> = { day: "", touches: "/crm/touches", people: "/crm/people", calendar: "/calendar" };

export default async function Home({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ to?: string; app?: string }> }) {
  const { locale } = await params;
  const { to, app } = await searchParams;
  // The Android app opens "/?app=android": the mark is carried on to the first real page, where it is remembered.
  const mark = app === "android" ? "?app=android" : "";
  const session = await auth();
  if (!session?.user?.id) return redirect({ href: `/sign-in${mark}`, locale });
  const memberships = await db.membership.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "asc" }, include: { workspace: { select: { slug: true } } } });
  // The team's workspace first; a person who is only a client lands in the portal.
  const team = memberships.find((m) => m.role !== "CLIENT");
  if (team) return redirect({ href: `/w/${team.workspace.slug}${(to && SHORTCUTS[to]) || ""}${mark}`, locale });
  const client = memberships[0];
  return redirect({ href: client ? `/portal/${client.workspace.slug}` : "/onboarding", locale });
}
