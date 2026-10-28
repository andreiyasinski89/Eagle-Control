import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { ApiError } from "@/server/http/errors";
import { listPortalProjects } from "@/server/services/portal";

export const dynamic = "force-dynamic";

export default async function PortalHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [t, session] = await Promise.all([getTranslations("portal"), auth()]);
  const ws = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  let list: Awaited<ReturnType<typeof listPortalProjects>> | null = null;
  let unavailable = false;
  try {
    list = await listPortalProjects(session?.user?.id ?? "", ws.id);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    unavailable = true; // the plan does not include the portal (402) or this person has no access (404)
  }
  if (unavailable || !list) return <p className="p-8 text-center text-muted-foreground">{t("unavailable")}</p>;
  // A person who is here only as someone's client has no workspace of their own yet: say how they can have one.
  const team = session?.user?.id ? await db.membership.count({ where: { userId: session.user.id, role: { not: "CLIENT" } } }) : 0;
  // One project: go straight to it.
  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">{t("yourProjects")}</h1>
      {list.items.length === 0 ? (
        <p className="text-muted-foreground">{t("noProjects")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 sm:auto-rows-fr">
          {list.items.map((p) => (
            <li key={p.id} className="flex">
              <Link href={`/portal/${slug}/p/${p.id}`} data-testid="portal-project" className="flex w-full flex-col rounded-lg border border-border bg-card p-4 hover:border-primary" style={{ borderLeft: `5px solid var(--health-${p.health.toLowerCase()})` }}>
                <div className="font-medium">{p.title}</div>
                <div className="mt-auto flex items-center gap-2 pt-3 text-xs text-muted-foreground">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full" style={{ width: `${p.progress}%`, background: `var(--health-${p.health.toLowerCase()})` }} />
                  </div>
                  {p.progress}%
                </div>
                {p.pendingApprovals > 0 && <div className="mt-2 text-xs font-medium text-primary">{t("needsYou", { n: p.pendingApprovals })}</div>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {team === 0 && (
        <section className="mt-8 flex flex-col gap-3 rounded-2xl border border-border bg-card p-5" data-testid="portal-own-workspace">
          <h2 className="font-semibold">{t("ownTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("ownText")}</p>
          <Link href="/onboarding" className="inline-flex h-9 w-fit items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
            {t("ownButton")}
          </Link>
        </section>
      )}
    </main>
  );
}
