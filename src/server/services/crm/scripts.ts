import { z } from "zod";
import { db } from "@/server/db";
import { notFound } from "@/server/http/errors";
import { STAGES } from "@/modules/crm/people";
import { loadWorkspaceMember, logActivity, type Tx } from "@/server/services/nodes/access";
import { invalid } from "./common";

export const SCRIPT_LIMIT = 200;

const fields = z.object({ title: z.string().trim().min(1).max(120), stage: z.enum(STAGES).nullable(), body: z.string().trim().min(1).max(4000) });
export const createScriptSchema = fields;
export const patchScriptSchema = fields.partial().refine((v) => Object.keys(v).length > 0, "Nothing to update");

const dto = (s: { id: string; title: string; stage: string | null; body: string; position: number }) => ({ id: s.id, title: s.title, stage: s.stage, body: s.body, position: s.position });

export async function listScripts(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const rows = await db.script.findMany({ where: { workspaceId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return { items: rows.map(dto) };
}

export async function createScript(userId: string, workspaceId: string, input: z.infer<typeof createScriptSchema>) {
  return db.$transaction(async (tx) => {
    await loadWorkspaceMember(tx, userId, workspaceId, "crm:write");
    const count = await tx.script.count({ where: { workspaceId } });
    if (count >= SCRIPT_LIMIT) throw invalid("script_limit", `A workspace holds up to ${SCRIPT_LIMIT} scripts`);
    const s = await tx.script.create({ data: { workspaceId, title: input.title, stage: input.stage, body: input.body, position: count, createdById: userId } });
    await logActivity(tx, { workspaceId, nodeId: null, actorId: userId, action: "script.created", diff: { title: s.title } });
    return dto(s);
  });
}

async function loadScript(tx: Tx, userId: string, id: string) {
  const s = await tx.script.findUnique({ where: { id } });
  if (!s) throw notFound("script");
  await loadWorkspaceMember(tx, userId, s.workspaceId, "crm:write");
  return s;
}

export async function updateScript(userId: string, id: string, patch: z.infer<typeof patchScriptSchema>) {
  return db.$transaction(async (tx) => {
    await loadScript(tx, userId, id);
    return dto(await tx.script.update({ where: { id }, data: patch }));
  });
}

export async function deleteScript(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const s = await loadScript(tx, userId, id);
    await tx.script.delete({ where: { id } });
    await logActivity(tx, { workspaceId: s.workspaceId, nodeId: null, actorId: userId, action: "script.deleted", diff: { title: s.title } });
    return { deleted: true };
  });
}
