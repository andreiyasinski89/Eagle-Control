import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { notFound } from "@/server/http/errors";
import { childrenIndex } from "@/modules/nodes/progress";
import { BUILT_IN_TEMPLATES, templateNodeSchema, type TemplateNode } from "@/modules/nodes/templates";
import { loadNode, loadWorkspaceMember } from "@/server/services/nodes/access";
import { workspaceTemplateSchema } from "@/server/services/nodes/ops";
import { invalid } from "./common";

const DAY = 86_400_000;

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  defaultDurationDays: z.number().int().min(1).max(3650).default(60),
  root: templateNodeSchema,
});

export async function listTemplates(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "project:create");
  const rows = await db.projectTemplate.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
  return {
    builtIn: Object.entries(BUILT_IN_TEMPLATES).map(([key, t]) => ({ key, name: t.name, defaultDurationDays: t.defaultDurationDays, empty: t.structure === null })),
    custom: rows.map((r) => ({ id: r.id, name: r.name, defaultDurationDays: workspaceTemplateSchema.safeParse(r.structure).data?.defaultDurationDays ?? 60 })),
  };
}

export async function createTemplate(userId: string, workspaceId: string, input: z.infer<typeof createTemplateSchema>) {
  await loadWorkspaceMember(db, userId, workspaceId, "project:create");
  if (input.root.type !== "PROJECT") throw invalid("invalid_template", "A template starts at a project");
  return db.projectTemplate.create({ data: { workspaceId, name: input.name, structure: { defaultDurationDays: input.defaultDurationDays, root: input.root } as unknown as Prisma.InputJsonValue } });
}

export async function deleteTemplate(userId: string, id: string) {
  const t = await db.projectTemplate.findUnique({ where: { id } });
  if (!t || !t.workspaceId) throw notFound("template");
  await loadWorkspaceMember(db, userId, t.workspaceId, "project:create");
  await db.projectTemplate.delete({ where: { id } });
}

/** Captures a project's shape (types, titles, estimations and timing relative to its start) as a reusable template. */
export async function saveProjectAsTemplate(userId: string, projectId: string, name: string) {
  const { node: project } = await loadNode(db, userId, projectId, "project:create");
  if (project.type !== "PROJECT") throw notFound("project");
  const rows = await db.node.findMany({ where: { archivedAt: null, OR: [{ id: projectId }, { rootId: projectId }] }, select: { id: true, parentId: true, type: true, title: true, estimation: true, startDate: true, dueDate: true, position: true } });
  const byParent = childrenIndex(rows.sort((a, b) => a.position - b.position));
  const start = project.startDate ? Math.floor(project.startDate.getTime() / DAY) : null;

  const build = (n: (typeof rows)[number], isRoot: boolean): TemplateNode => {
    const out: TemplateNode = { type: n.type, title: isRoot ? "" : n.title };
    if (n.estimation !== null) out.estimation = Number(n.estimation);
    if (!isRoot && start !== null && n.startDate && n.dueDate) {
      out.offsetDays = Math.max(0, Math.floor(n.startDate.getTime() / DAY) - start);
      out.durationDays = Math.max(1, Math.ceil((n.dueDate.getTime() - n.startDate.getTime()) / DAY));
    }
    const kids = (byParent.get(n.id) ?? []).map((k) => build(k, false));
    if (kids.length) out.children = kids;
    return out;
  };
  const root = rows.find((r) => r.id === projectId);
  if (!root) throw notFound("project");
  const tree = build(root, true);
  const defaultDurationDays = project.startDate && project.dueDate ? Math.max(1, Math.round((project.dueDate.getTime() - project.startDate.getTime()) / DAY)) : 60;
  return createTemplate(userId, project.workspaceId, { name, defaultDurationDays, root: tree });
}
