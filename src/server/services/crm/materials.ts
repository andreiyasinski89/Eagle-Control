import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { forbidden, notFound } from "@/server/http/errors";
import { can } from "@/server/policies";
import { cleanQr, isLink, MATERIAL_KINDS, MATERIAL_LANGS, QR_CORNERS, QR_SIZE_MAX, QR_SIZE_MIN } from "@/modules/crm/materials";
import { deleteObject, presignDownload, presignUpload } from "@/server/storage";
import { safeFileName } from "@/server/services/attachments";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { invalid } from "./common";

export const MAX_MATERIAL_BYTES = 25 * 1024 * 1024;
export const MAX_MATERIALS = 300;

const url = z.string().trim().max(500).refine(isLink, "A link starts with http:// or https://");
const qr = z.object({ corner: z.enum(QR_CORNERS), size: z.number().int().min(QR_SIZE_MIN).max(QR_SIZE_MAX) }).nullable();
const fields = {
  title: z.string().trim().min(1).max(120),
  kind: z.enum(MATERIAL_KINDS),
  lang: z.enum(MATERIAL_LANGS),
  category: z.string().trim().max(40).nullable().optional(),
  url: url.nullable().optional(),
  qr: qr.optional(),
};
export const uploadSchema = z.object({ fileName: z.string().trim().min(1).max(200), mime: z.string().min(3).max(100), size: z.number().int().positive().max(MAX_MATERIAL_BYTES) });
export const materialSchema = z.object({
  ...fields,
  file: z.object({ key: z.string().min(10).max(400), fileName: z.string().trim().min(1).max(200), mime: z.string().min(3).max(100), size: z.number().int().positive().max(MAX_MATERIAL_BYTES) }).nullable().optional(),
  /** For the whole team: only owners and admins may. */
  shared: z.boolean().default(false),
});
export const patchMaterialSchema = z.object({ ...fields }).partial();

type Row = Awaited<ReturnType<typeof db.material.findFirstOrThrow>>;

const shareUrl = (key: string) => `${env().APP_URL}/m/${key}`;
const dto = (m: Row, me: string, lead: boolean) => ({
  id: m.id,
  title: m.title,
  kind: m.kind,
  lang: m.lang,
  category: m.category,
  url: m.url,
  hasFile: !!m.fileKey,
  fileName: m.fileName,
  size: m.size,
  qr: cleanQr(m.qr),
  shared: m.ownerId === null,
  mine: m.ownerId === me,
  /// What goes into a message: the link to the outside page, or ours for an uploaded file.
  link: m.url ?? shareUrl(m.shareKey),
  canEdit: m.ownerId === me || (m.ownerId === null && lead),
});

async function member(userId: string, workspaceId: string, action: "workspace:read" | "crm:write") {
  const m = await loadWorkspaceMember(db, userId, workspaceId, action);
  return { m, lead: can(m, "workspace:update") };
}

/** The shared materials and the member's own, newest first. */
export async function listMaterials(userId: string, workspaceId: string) {
  const { lead } = await member(userId, workspaceId, "workspace:read");
  const rows = await db.material.findMany({ where: { workspaceId, OR: [{ ownerId: null }, { ownerId: userId }] }, orderBy: { createdAt: "desc" } });
  return { items: rows.map((r) => dto(r, userId, lead)), canShare: lead };
}

/** A place for the file, and the address to put it to. */
export async function startMaterialUpload(userId: string, workspaceId: string, input: z.infer<typeof uploadSchema>) {
  await member(userId, workspaceId, "crm:write");
  const key = `${workspaceId}/materials/${randomBytes(8).toString("hex")}-${safeFileName(input.fileName)}`;
  return { key, uploadUrl: await presignUpload(key, input.mime, input.size), headers: { "content-type": input.mime } };
}

export async function createMaterial(userId: string, workspaceId: string, input: z.infer<typeof materialSchema>) {
  const { lead } = await member(userId, workspaceId, "crm:write");
  if (input.shared && !lead) throw forbidden();
  const link = input.url?.trim() || null;
  if (!link && !input.file) throw invalid("no_content", "Give a link or a file");
  if (link && !isLink(link)) throw invalid("invalid_link", "A link starts with http:// or https://");
  if (link && input.file) throw invalid("two_contents", "A material is a link or a file, not both");
  if (input.file && !input.file.key.startsWith(`${workspaceId}/materials/`)) throw invalid("invalid_key", "The upload does not belong to this workspace");
  if ((await db.material.count({ where: { workspaceId } })) >= MAX_MATERIALS) throw invalid("limit", "The library is full");
  const row = await db.material.create({
    data: {
      workspaceId,
      title: input.title,
      kind: input.kind,
      lang: input.lang,
      category: input.category?.trim() || null,
      url: link,
      fileKey: input.file?.key ?? null,
      fileName: input.file?.fileName ?? null,
      mime: input.file?.mime ?? null,
      size: input.file?.size ?? null,
      qr: input.kind === "IMAGE" && input.qr ? (input.qr as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      ownerId: input.shared ? null : userId,
      shareKey: randomBytes(12).toString("base64url"),
      createdById: userId,
    },
  });
  return dto(row, userId, lead);
}

async function editable(userId: string, id: string) {
  const row = await db.material.findUnique({ where: { id } });
  if (!row) throw notFound("material");
  const { lead } = await member(userId, row.workspaceId, "workspace:read");
  const ok = row.ownerId === userId || (row.ownerId === null && lead);
  if (!ok) throw forbidden();
  return { row, lead };
}

export async function updateMaterial(userId: string, id: string, patch: z.infer<typeof patchMaterialSchema>) {
  const { row, lead } = await editable(userId, id);
  const kind = patch.kind ?? row.kind;
  if (patch.url && !isLink(patch.url)) throw invalid("invalid_link", "A link starts with http:// or https://");
  const data: Prisma.MaterialUpdateInput = {
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
    ...(patch.lang !== undefined ? { lang: patch.lang } : {}),
    ...(patch.category !== undefined ? { category: patch.category?.trim() || null } : {}),
    ...(patch.url !== undefined && !row.fileKey ? { url: patch.url } : {}),
    ...(patch.qr !== undefined || patch.kind !== undefined ? { qr: kind === "IMAGE" && (patch.qr ?? cleanQr(row.qr)) ? ((patch.qr ?? cleanQr(row.qr)) as unknown as Prisma.InputJsonValue) : Prisma.DbNull } : {}),
  };
  return dto(await db.material.update({ where: { id }, data }), userId, lead);
}

export async function deleteMaterial(userId: string, id: string) {
  const { row } = await editable(userId, id);
  await db.material.delete({ where: { id } });
  if (row.fileKey) await deleteObject(row.fileKey).catch(() => undefined);
}

/** For the picture that gets the member's QR code: the member may read the file of a material they can see. */
export async function materialFileUrl(userId: string, id: string) {
  const row = await db.material.findUnique({ where: { id } });
  if (!row?.fileKey) throw notFound("material");
  await member(userId, row.workspaceId, "workspace:read");
  if (row.ownerId !== null && row.ownerId !== userId) throw notFound("material");
  return { url: await presignDownload(row.fileKey, row.fileName ?? "file", 120, true), mime: row.mime ?? "application/octet-stream" };
}

/** Where a link given to somebody leads: the outside page, or the file shown in the browser. Nothing else of the material is given out. */
export async function resolveShare(shareKey: string): Promise<{ url: string } | null> {
  const row = await db.material.findUnique({ where: { shareKey } });
  if (!row) return null;
  if (row.url) return { url: row.url };
  return row.fileKey ? { url: await presignDownload(row.fileKey, row.fileName ?? "file", 300, true) } : null;
}
