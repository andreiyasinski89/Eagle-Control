import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/server/db";
import { ApiError, notFound } from "@/server/http/errors";
import { deleteObject, presignDownload, presignUpload } from "@/server/storage";
import { loadNode, logActivity } from "./nodes/access";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export const presignSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mime: z.string().min(3).max(100),
  size: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
});
export const confirmSchema = presignSchema.extend({ key: z.string().min(10).max(400) });

/** Keeps the original name readable but harmless inside an object key. */
export function safeFileName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").replace(/\.{2,}/g, ".").slice(0, 120) || "file";
}

export async function startUpload(userId: string, nodeId: string, input: z.infer<typeof presignSchema>) {
  const { node } = await loadNode(db, userId, nodeId, "node:write");
  const key = `${node.workspaceId}/${node.id}/${randomBytes(8).toString("hex")}-${safeFileName(input.fileName)}`;
  return { key, uploadUrl: await presignUpload(key, input.mime, input.size), headers: { "content-type": input.mime } };
}

export async function confirmUpload(userId: string, nodeId: string, input: z.infer<typeof confirmSchema>) {
  const { node } = await loadNode(db, userId, nodeId, "node:write");
  // The key must belong to this node: it was minted for it by startUpload.
  if (!input.key.startsWith(`${node.workspaceId}/${node.id}/`)) throw new ApiError(422, "invalid_key", "Upload key does not match this node");
  const attachment = await db.attachment.create({
    data: { nodeId, fileName: input.fileName, mime: input.mime, size: input.size, url: input.key, uploadedById: userId },
  });
  await logActivity(db, { workspaceId: node.workspaceId, nodeId, actorId: userId, action: "attachment.added", diff: { fileName: input.fileName } });
  return attachment;
}

export async function downloadUrl(userId: string, attachmentId: string) {
  const a = await db.attachment.findUnique({ where: { id: attachmentId } });
  if (!a) throw notFound("attachment");
  await loadNode(db, userId, a.nodeId);
  return presignDownload(a.url, a.fileName);
}

export async function removeAttachment(userId: string, attachmentId: string) {
  const a = await db.attachment.findUnique({ where: { id: attachmentId } });
  if (!a) throw notFound("attachment");
  const { node } = await loadNode(db, userId, a.nodeId, "node:write");
  await db.attachment.delete({ where: { id: a.id } });
  await logActivity(db, { workspaceId: node.workspaceId, nodeId: node.id, actorId: userId, action: "attachment.removed", diff: { fileName: a.fileName } });
  await deleteObject(a.url).catch(() => undefined); // orphaned object is harmless; the row is the source of truth
}
