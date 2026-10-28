import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/server/policies";
import { listProjects } from "@/server/services/nodes/queries";
import { EditProjectButton } from "./edit-project-dialog";
import { NewProjectDialog } from "./new-project-dialog";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [t, tm, session] = await Promise.all([getTranslations("projects"), getTranslations("map"), auth()]);
  const userId = session?.user?.id ?? "";
  const workspace = await db.workspace.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  const membership = await db.membership.findUniqueOrThrow({ where: { userId_workspaceId: { userId, workspaceId: workspace.id } } });
  const projects = await listProjects(userId, workspace.id);

  const canEdit = can(membership, "project:create");

  return (
    <section className="max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {can(membership, "project:create") && <NewProjectDialog workspaceId={workspace.id} slug={slug} />}
      </div>
      {projects.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 sm:auto-rows-fr">
          {projects.map((p) => (
            <li key={p.id} className="relative flex">
              <Link
                href={`/w/${slug}/projects/p/${p.id}`}
                className="flex w-full flex-col rounded-lg border border-border bg-card p-4 hover:border-primary"
                style={{ borderLeft: `5px solid var(--health-${p.health.toLowerCase()})` }}
              >
                <div className={canEdit ? "pr-8 font-medium" : "font-medium"}>{p.title}</div>
                {p.description ? (
                  <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</div>
                ) : (
                  canEdit && <div className="mt-1 text-sm italic text-muted-foreground/70">{t("noDescription")}</div>
                )}
                <div className="mt-auto flex items-center gap-2 pt-3 text-xs text-muted-foreground">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full" style={{ width: `${p.progress}%`, background: `var(--health-${p.health.toLowerCase()})` }} />
                  </div>
                  <span className="tabular-nums">{p.progress}%</span>
                  <span>{tm(`health.${p.health}`)}</span>
                </div>
              </Link>
              {canEdit && <EditProjectButton id={p.id} title={p.title} description={p.description ?? null} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
