import type { PrismaClient } from "@prisma/client";
import { createDemoProject } from "../src/server/services/demo";
import { createDemoCrm } from "../src/server/services/demo-crm";
import { createWorkspace } from "../src/server/services/workspace";
import { db } from "../src/server/db";

async function main(prisma: PrismaClient) {
  const owner = await prisma.user.upsert({
    where: { email: "demo@meetowl.local" },
    update: {},
    create: { email: "demo@meetowl.local", name: "Demo Owner", emailVerified: new Date(), skills: ["product", "frontend"] },
  });
  const member = await prisma.user.upsert({
    where: { email: "member@meetowl.local" },
    update: {},
    create: { email: "member@meetowl.local", name: "Demo Member", emailVerified: new Date(), skills: ["backend"] },
  });

  let workspace = await prisma.workspace.findUnique({ where: { slug: "demo-studio" } });
  if (!workspace) workspace = await createWorkspace(owner.id, "Demo Studio", "demo-studio");

  await prisma.membership.upsert({
    where: { userId_workspaceId: { userId: member.id, workspaceId: workspace.id } },
    update: {},
    create: { userId: member.id, workspaceId: workspace.id, role: "MEMBER" },
  });

  const hasDemo = await prisma.node.findFirst({ where: { workspaceId: workspace.id, type: "PROJECT", title: "New Product Launch" } });
  if (!hasDemo) {
    await prisma.membership.update({ where: { userId_workspaceId: { userId: member.id, workspaceId: workspace.id } }, data: { crmAccess: true } });
    const { project } = await createDemoProject(owner.id, workspace.id, { a: owner.id, b: member.id });
    await createDemoCrm(owner.id, workspace.id, { a: owner.id, b: member.id }, project.id);
  }
  console.log("Seeded: demo@meetowl.local (owner), member@meetowl.local, workspace demo-studio with the New Product Launch demo project and a small CRM (companies, contacts, deals, a lead form)");
}

main(db)
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
