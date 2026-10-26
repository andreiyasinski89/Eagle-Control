import { db } from "@/server/db";
import { createDemoProject } from "./demo";
import { createDemoCrm } from "./demo-crm";
import { createWorkspace } from "./workspace";

export const DEMO_OWNER_EMAIL = "demo@meetowl.local";
export const DEMO_MEMBER_EMAIL = "member@meetowl.local";
export const DEMO_SLUG = "demo-studio";

/** Two users, the Demo Studio workspace, the "New Product Launch" project and a small CRM. Safe to run again: it only fills what is missing. */
export async function seedDemoData(): Promise<{ ownerId: string; workspaceId: string }> {
  const owner = await db.user.upsert({
    where: { email: DEMO_OWNER_EMAIL },
    update: {},
    create: { email: DEMO_OWNER_EMAIL, name: "Demo Owner", emailVerified: new Date(), skills: ["product", "frontend"] },
  });
  const member = await db.user.upsert({
    where: { email: DEMO_MEMBER_EMAIL },
    update: {},
    create: { email: DEMO_MEMBER_EMAIL, name: "Demo Member", emailVerified: new Date(), skills: ["backend"] },
  });

  let workspace = await db.workspace.findUnique({ where: { slug: DEMO_SLUG } });
  if (!workspace) workspace = await createWorkspace(owner.id, "Demo Studio", DEMO_SLUG);

  await db.membership.upsert({
    where: { userId_workspaceId: { userId: member.id, workspaceId: workspace.id } },
    update: {},
    create: { userId: member.id, workspaceId: workspace.id, role: "MEMBER" },
  });

  const hasDemo = await db.node.findFirst({ where: { workspaceId: workspace.id, type: "PROJECT", title: "New Product Launch" } });
  if (!hasDemo) {
    await db.membership.update({ where: { userId_workspaceId: { userId: member.id, workspaceId: workspace.id } }, data: { crmAccess: true } });
    const { project } = await createDemoProject(owner.id, workspace.id, { a: owner.id, b: member.id });
    await createDemoCrm(owner.id, workspace.id, { a: owner.id, b: member.id }, project.id);
  }
  return { ownerId: owner.id, workspaceId: workspace.id };
}
