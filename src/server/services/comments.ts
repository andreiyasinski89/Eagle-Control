import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/server/db";
import { ApiError, forbidden, notFound } from "@/server/http/errors";
import { loadNode, logActivity } from "./nodes/access";
import { nodePath } from "./links";
import { notify } from "./notify";
import { publishComment } from "@/server/realtime";

export const commentBodySchema = z.object({ type: z.literal("doc") }).passthrough();

export const createCommentSchema = z.object({
  body: commentBodySchema,
  mentions: z.array(z.string()).max(20).default([]),
  parentCommentId: z.string().nullable().default(null),
  /** Show this comment in the client portal; only for nodes shared with clients. */
  visibleToClient: z.boolean().optional(),
});
export type CreateCommentInput = z.infer<typeof createCommentSchema>;

const authorSelect = { id: true, name: true, email: true, avatar: true, image: true } as const;

export async function listComments(userId: string, nodeId: string) {
  await loadNode(db, userId, nodeId);
  return db.comment.findMany({
    where: { nodeId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: authorSelect } },
  });
}

export async function createComment(userId: string, nodeId: string, input: CreateCommentInput) {
  return db.$transaction(async (tx) => {
    const { node, projectId } = await loadNode(tx, userId, nodeId, "comment:write");

    if (input.visibleToClient && !node.visibleToClient) throw new ApiError(422, "not_shared", "Share the node with clients before writing to them");
    if (input.parentCommentId) {
      const parent = await tx.comment.findUnique({ where: { id: input.parentCommentId } });
      if (!parent || parent.nodeId !== nodeId) throw new ApiError(422, "invalid_parent", "Reply target not found on this node");
    }

    // Only people who can actually see this workspace may be mentioned (and notified).
    const mentions = [...new Set(input.mentions)].filter((id) => id !== userId);
    const valid = mentions.length
      ? await tx.membership.findMany({
          where: { workspaceId: node.workspaceId, userId: { in: mentions } },
          select: { userId: true },
        })
      : [];
    const mentioned = valid.map((m) => m.userId);

    const comment = await tx.comment.create({
      data: {
        nodeId,
        authorId: userId,
        body: input.body as Prisma.InputJsonValue,
        mentions: mentioned,
        parentCommentId: input.parentCommentId,
        visibleToClient: input.visibleToClient === true,
      },
      include: { author: { select: authorSelect } },
    });

    if (mentioned.length > 0) {
      const author = await tx.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
      for (const id of mentioned) {
        await notify(
          { userId: id, workspaceId: node.workspaceId, kind: "mention", title: `${author?.name ?? author?.email ?? "Someone"} mentioned you in “${node.title}”`, url: nodePath(node), payload: { nodeId, projectId, commentId: comment.id, byUserId: userId } },
          tx,
        );
      }
    }
    await logActivity(tx, {
      workspaceId: node.workspaceId,
      nodeId,
      actorId: userId,
      action: "comment.created",
      diff: { commentId: comment.id },
    });
    publishComment(projectId, nodeId, userId);
    return comment;
  });
}

export async function updateComment(userId: string, commentId: string, body: unknown) {
  const parsed = commentBodySchema.parse(body);
  const comment = await db.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw notFound("comment");
  const { projectId } = await loadNode(db, userId, comment.nodeId, "comment:write");
  if (comment.authorId !== userId) throw forbidden();
  publishComment(projectId, comment.nodeId, userId);
  return db.comment.update({
    where: { id: commentId },
    data: { body: parsed as Prisma.InputJsonValue },
    include: { author: { select: authorSelect } },
  });
}

export async function deleteComment(userId: string, commentId: string) {
  const comment = await db.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw notFound("comment");
  const { membership, projectId } = await loadNode(db, userId, comment.nodeId, "comment:write");
  const moderator = membership.role === "OWNER" || membership.role === "ADMIN";
  if (comment.authorId !== userId && !moderator) throw forbidden();
  await db.comment.delete({ where: { id: commentId } });
  publishComment(projectId, comment.nodeId, userId);
}
