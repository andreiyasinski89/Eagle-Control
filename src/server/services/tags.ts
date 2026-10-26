import { z } from "zod";
import { db } from "@/server/db";
import { conflict, notFound } from "@/server/http/errors";
import { loadNode, loadWorkspaceMember, logActivity } from "./nodes/access";
import { publishTreeSoon } from "@/server/realtime";

export const tagSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a #rrggbb colour"),
});
export const tagPatchSchema = tagSchema.partial().refine((v) => Object.keys(v).length > 0, "Nothing to update");

export async function listTags(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "workspace:read");
  return db.tag.findMany({ where: { workspaceId }, orderBy: { name: "asc" } });
}

export async function createTag(userId: string, workspaceId: string, input: z.infer<typeof tagSchema>) {
  await loadWorkspaceMember(db, userId, workspaceId, "tag:manage");
  const existing = await db.tag.findUnique({ where: { workspaceId_name: { workspaceId, name: input.name } } });
  if (existing) throw conflict("tag_exists", "A tag with this name already exists");
  return db.tag.create({ data: { workspaceId, ...input } });
}

async function loadTag(userId: string, tagId: string) {
  const tag = await db.tag.findUnique({ where: { id: tagId } });
  if (!tag) throw notFound("tag");
  await loadWorkspaceMember(db, userId, tag.workspaceId, "tag:manage");
  return tag;
}

export async function updateTag(userId: string, tagId: string, patch: z.infer<typeof tagPatchSchema>) {
  await loadTag(userId, tagId);
  return db.tag.update({ where: { id: tagId }, data: patch });
}

export async function deleteTag(userId: string, tagId: string) {
  await loadTag(userId, tagId);
  await db.tag.delete({ where: { id: tagId } });
}

export async function setNodeTags(userId: string, nodeId: string, tagIds: string[]) {
  return db.$transaction(async (tx) => {
    const { node, projectId } = await loadNode(tx, userId, nodeId, "node:write");
    const unique = [...new Set(tagIds)];
    const valid = await tx.tag.findMany({ where: { id: { in: unique }, workspaceId: node.workspaceId }, select: { id: true } });
    if (valid.length !== unique.length) throw notFound("tag");
    await tx.nodeTag.deleteMany({ where: { nodeId } });
    if (unique.length) await tx.nodeTag.createMany({ data: unique.map((tagId) => ({ nodeId, tagId })) });
    await logActivity(tx, { workspaceId: node.workspaceId, nodeId, actorId: userId, action: "node.tags", diff: { tagIds: unique } });
    publishTreeSoon(projectId, userId);
    return tx.tag.findMany({ where: { id: { in: unique } } });
  });
}
