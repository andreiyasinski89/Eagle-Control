import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/ui/modal";
import { env } from "@/lib/env";
import { redirect } from "@/i18n/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { connectableWorkspaces, isKnownClientHost, OAuthError, validateAuthorize } from "@/server/services/oauth";

export const dynamic = "force-dynamic";

const PARAMS = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const;

/** Where a person says yes or no to an application (Claude) acting for them. Nothing is granted before the button is pressed. */
export default async function Authorize({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ locale }, sp, t] = await Promise.all([params, searchParams, getTranslations("oauth")]);
  const query: Record<string, string> = {};
  for (const k of PARAMS) {
    const v = sp[k];
    if (typeof v === "string") query[k] = v;
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return redirect({ href: { pathname: "/sign-in", query: { callbackUrl: `/oauth/authorize?${new URLSearchParams(query).toString()}` } }, locale });

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-4 py-10">
      <h1 className="text-2xl font-semibold">🦉 MeetOwl</h1>
      {children}
    </main>
  );

  let valid;
  try {
    valid = await validateAuthorize(query, env().APP_URL.replace(/\/$/, ""));
  } catch (e) {
    return shell(
      <p role="alert" className="rounded-lg border border-border bg-card p-4 text-sm">
        {t("invalid")} {e instanceof OAuthError ? `(${e.message})` : ""}
      </p>,
    );
  }

  const [user, workspaces] = await Promise.all([db.user.findUnique({ where: { id: userId }, select: { email: true } }), connectableWorkspaces(userId)]);
  const host = new URL(valid.params.redirect_uri).host;

  return shell(
    <>
      <div>
        <h2 className="text-lg font-semibold">{t("title", { app: valid.client.name })}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("intro", { app: valid.client.name, email: user?.email ?? "" })}</p>
      </div>

      {!isKnownClientHost(valid.params.redirect_uri) && (
        <p role="alert" className="rounded-lg border border-[var(--health-yellow)] bg-card p-3 text-sm" data-testid="oauth-unknown-host">
          {t("unknownHost", { host })}
        </p>
      )}

      {workspaces.length === 0 ? (
        <p role="alert" className="rounded-lg border border-border bg-card p-4 text-sm" data-testid="oauth-no-workspace">
          {t("noWorkspace")}
        </p>
      ) : (
        <form method="post" action="/api/oauth/authorize" className="flex flex-col gap-4" data-testid="oauth-consent">
          {PARAMS.filter((k) => query[k] !== undefined).map((k) => (
            <input key={k} type="hidden" name={k} value={query[k]} />
          ))}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("workspace")}</span>
            <select name="workspaceId" className={selectClass} defaultValue={workspaces[0]?.id}>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="mb-1 font-medium">{t("access")}</legend>
            <label className="flex items-start gap-2">
              <input type="radio" name="scope" value="write" defaultChecked className="mt-1" />
              <span>
                {t("readWrite")}
                <span className="block text-xs text-muted-foreground">{t("readWriteHint")}</span>
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="scope" value="read" className="mt-1" />
              <span>
                {t("readOnly")}
                <span className="block text-xs text-muted-foreground">{t("readOnlyHint")}</span>
              </span>
            </label>
          </fieldset>
          <p className="text-sm">{t("returnTo", { host })}</p>
          <div className="flex gap-2">
            <Button type="submit" name="decision" value="allow" data-testid="oauth-allow">
              {t("allow")}
            </Button>
            <Button type="submit" name="decision" value="deny" variant="ghost">
              {t("deny")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("revokeHint")}</p>
        </form>
      )}
    </>,
  );
}
