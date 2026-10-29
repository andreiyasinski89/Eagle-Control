import { z } from "zod";
import type { Script } from "@prisma/client";
import { db } from "@/server/db";
import { forbidden, notFound } from "@/server/http/errors";
import { STAGES } from "@/modules/crm/people";
import { STARTER_SCRIPTS, starterLocale, starterSituation } from "@/modules/crm/starter-scripts";
import { SITUATIONS } from "@/modules/crm/touch";
import { can } from "@/server/policies";
import { loadWorkspaceMember, logActivity, type Tx } from "@/server/services/nodes/access";
import { invalid } from "./common";

export const SCRIPT_LIMIT = 200;

const fields = z.object({
  title: z.string().trim().min(1).max(120),
  stage: z.enum(STAGES).nullable(),
  situation: z.enum(SITUATIONS).nullable().optional(),
  body: z.string().trim().min(1).max(4000),
});
/** `shared`: a script for the whole team. Only an owner or an admin may make one; everybody else's scripts are their own. */
export const createScriptSchema = fields.extend({ shared: z.boolean().optional() });
export const patchScriptSchema = fields.partial().refine((v) => Object.keys(v).length > 0, "Nothing to update");

const dto = (s: Pick<Script, "id" | "title" | "stage" | "situation" | "body" | "position" | "ownerId">, userId: string) => ({
  id: s.id,
  title: s.title,
  stage: s.stage,
  situation: s.situation,
  body: s.body,
  position: s.position,
  /** A script of the whole team: open to everybody, changed only by its leaders. */
  shared: s.ownerId === null,
  mine: s.ownerId === userId,
});

/** The team's scripts and the member's own. Other people's own scripts are theirs alone. */
export async function listScripts(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const rows = await db.script.findMany({ where: { workspaceId, OR: [{ ownerId: null }, { ownerId: userId }] }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return { items: rows.map((r) => dto(r, userId)) };
}

export async function createScript(userId: string, workspaceId: string, input: z.infer<typeof createScriptSchema>) {
  return db.$transaction(async (tx) => {
    const m = await loadWorkspaceMember(tx, userId, workspaceId, "crm:write");
    if (input.shared && !can(m, "workspace:update")) throw forbidden();
    const count = await tx.script.count({ where: { workspaceId } });
    if (count >= SCRIPT_LIMIT) throw invalid("script_limit", `A workspace holds up to ${SCRIPT_LIMIT} scripts`);
    const s = await tx.script.create({ data: { workspaceId, title: input.title, stage: input.stage, situation: input.situation ?? null, body: input.body, ownerId: input.shared ? null : userId, position: count, createdById: userId } });
    await logActivity(tx, { workspaceId, nodeId: null, actorId: userId, action: "script.created", diff: { title: s.title, shared: !!input.shared } });
    return dto(s, userId);
  });
}

/** A script one may change: the team's, for its leaders; one's own. Somebody else's own script does not exist for them. */
async function loadScript(tx: Tx, userId: string, id: string) {
  const s = await tx.script.findUnique({ where: { id } });
  if (!s) throw notFound("script");
  const m = await loadWorkspaceMember(tx, userId, s.workspaceId, "crm:write");
  if (s.ownerId === null) {
    if (!can(m, "workspace:update")) throw forbidden();
  } else if (s.ownerId !== userId) throw notFound("script");
  return s;
}

export async function updateScript(userId: string, id: string, patch: z.infer<typeof patchScriptSchema>) {
  return db.$transaction(async (tx) => {
    await loadScript(tx, userId, id);
    return dto(await tx.script.update({ where: { id }, data: patch }), userId);
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

/** A copy of a script of the team (or of one's own) as one's own, to be changed freely. */
export async function copyScript(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const s = await tx.script.findUnique({ where: { id } });
    if (!s) throw notFound("script");
    await loadWorkspaceMember(tx, userId, s.workspaceId, "crm:write");
    if (s.ownerId !== null && s.ownerId !== userId) throw notFound("script");
    const count = await tx.script.count({ where: { workspaceId: s.workspaceId } });
    if (count >= SCRIPT_LIMIT) throw invalid("script_limit", `A workspace holds up to ${SCRIPT_LIMIT} scripts`);
    const copy = await tx.script.create({ data: { workspaceId: s.workspaceId, title: s.title, stage: s.stage, situation: s.situation, body: s.body, ownerId: userId, position: count, createdById: userId } });
    await logActivity(tx, { workspaceId: s.workspaceId, nodeId: null, actorId: userId, action: "script.copied", diff: { title: s.title } });
    return dto(copy, userId);
  });
}

export const starterScriptsSchema = z.object({ locale: z.enum(["ru", "en", "pl", "uk"]).optional() });

/**
 * The ready-made scripts for every stage of the funnel, in the person's language. A leader adds them for the whole team; anybody else for themselves.
 * Safe to press again: a script whose title is already there (they may have rewritten it, or deleted its twin) is not added a second time.
 * Returns how many were added and skipped.
 */
export async function addStarterScripts(userId: string, workspaceId: string, locale?: string | null) {
  return db.$transaction(async (tx) => {
    const m = await loadWorkspaceMember(tx, userId, workspaceId, "crm:write");
    const shared = can(m, "workspace:update");
    const wanted = STARTER_SCRIPTS[starterLocale(locale)];
    const have = await tx.script.findMany({ where: { workspaceId, OR: [{ ownerId: null }, { ownerId: userId }] }, select: { id: true, title: true, situation: true } });
    const titles = new Set(have.map((s) => s.title.trim().toLowerCase()));
    const total = await tx.script.count({ where: { workspaceId } });
    const fresh = wanted.map((s, i) => ({ s, i })).filter(({ s }) => !titles.has(s.title.trim().toLowerCase()));
    if (total + fresh.length > SCRIPT_LIMIT) throw invalid("script_limit", `A workspace holds up to ${SCRIPT_LIMIT} scripts`);
    if (fresh.length) {
      await tx.script.createMany({ data: fresh.map(({ s, i }, k) => ({ workspaceId, title: s.title, stage: s.stage, situation: starterSituation(i), body: s.body, ownerId: shared ? null : userId, position: total + k, createdById: userId })) });
      await logActivity(tx, { workspaceId, nodeId: null, actorId: userId, action: "script.starter_added", diff: { added: fresh.length } });
    }
    // Scripts added before the moments existed get theirs by title, so the queue can choose the right one.
    const byTitle = new Map(wanted.map((s, i) => [s.title.trim().toLowerCase(), starterSituation(i)]));
    for (const h of have) {
      const sit = byTitle.get(h.title.trim().toLowerCase());
      if (sit && !h.situation) await tx.script.update({ where: { id: h.id }, data: { situation: sit } });
    }
    return { added: fresh.length, skipped: wanted.length - fresh.length };
  });
}
