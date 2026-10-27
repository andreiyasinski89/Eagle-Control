import { redirect } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

/** A person's link for joining the platform: the sign-up page, with the code carried along (the page checks it and says who invited). */
export default async function PlatformInvite({ params }: { params: Promise<{ locale: string; code: string }> }) {
  const { locale, code } = await params;
  return redirect({ href: { pathname: "/sign-in", query: { tab: "signup", inv: code.toLowerCase().slice(0, 16) } }, locale });
}
