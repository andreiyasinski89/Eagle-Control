import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { auth } from "@/server/auth";
import { ApiError } from "@/server/http/errors";
import { previewInvitation } from "@/server/services/invitation";
import { AcceptButton } from "./accept-button";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [t, tr, session] = await Promise.all([getTranslations("invite"), getTranslations("roles"), auth()]);

  let invite: Awaited<ReturnType<typeof previewInvitation>> | null = null;
  try {
    invite = await previewInvitation(token);
  } catch (err) {
    if (!(err instanceof ApiError)) throw err;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      {invite ? (
        <>
          <h1 className="text-2xl font-semibold">{t("title", { workspace: invite.workspace.name })}</h1>
          <p className="text-sm text-muted-foreground">{t("role", { role: tr(invite.role) })}</p>
          {session?.user?.id ? (
            <AcceptButton token={token} label={t("accept")} />
          ) : (
            <>
              <p className="text-sm">{t("signInFirst", { email: invite.email })}</p>
              <Button asChild>
                <Link href={{ pathname: "/sign-in", query: { callbackUrl: `/invite/${token}` } }}>Sign in</Link>
              </Button>
            </>
          )}
        </>
      ) : (
        <p role="alert">{t("invalid")}</p>
      )}
    </main>
  );
}
