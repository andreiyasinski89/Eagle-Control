import { redirect } from "@/i18n/navigation";

export const dynamic = "force-dynamic";

/** A sponsor's invitation link: the sign-up page, with the code carried along (the page checks it and says who invited). */
export default async function InvitationLink({ params }: { params: Promise<{ locale: string; code: string }> }) {
  const { locale, code } = await params;
  return redirect({ href: { pathname: "/sign-in", query: { tab: "signup", ref: code.toLowerCase().slice(0, 16) } }, locale });
}
