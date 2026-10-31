import { z } from "zod";
import type { Script } from "@prisma/client";
import { db } from "@/server/db";
import { forbidden, notFound } from "@/server/http/errors";
import { STAGES } from "@/modules/crm/people";
import { STARTER_SCRIPTS, starterKeyOf, starterLocale, starterSituation, starterText, type StarterLocale } from "@/modules/crm/starter-scripts";
import { LEGACY_STARTERS } from "@/modules/crm/starter-scripts-legacy";
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

type ScriptRow = Pick<Script, "id" | "title" | "stage" | "situation" | "body" | "position" | "ownerId" | "starterKey">;

/** The words to show: a ready-made script nobody has edited speaks the language of the screen; any other keeps what was written. */
export function shownText(s: Pick<Script, "title" | "body" | "starterKey">, locale: string) {
  const t = s.starterKey ? starterText(locale, s.starterKey) : null;
  return t ? { title: t.title, body: t.body } : { title: s.title, body: s.body };
}

const dto = (s: ScriptRow, userId: string, locale: string) => ({
  id: s.id,
  ...shownText(s, locale),
  stage: s.stage,
  situation: s.situation,
  position: s.position,
  /** A script of the whole team: open to everybody, changed only by its leaders. */
  shared: s.ownerId === null,
  mine: s.ownerId === userId,
  /** Still the ready-made text, following the language; false once somebody has edited it. */
  original: !!s.starterKey && !!starterText(locale, s.starterKey),
});

/** The language to show scripts in: the one the screen asked for, else the one the person saved, else English. */
export async function scriptLocale(userId: string, asked?: string | null): Promise<StarterLocale> {
  if (asked === "ru" || asked === "en" || asked === "pl" || asked === "uk") return asked;
  const u = await db.user.findUnique({ where: { id: userId }, select: { locale: true } });
  return starterLocale(u?.locale);
}

const same = (a: string, b: string) => a.trim() === b.trim();

/**
 * Scripts made before the language-following set existed carry no key. Those whose words are still exactly one of the old ready-made texts
 * (in any language) were never edited: they get the key, and from now on follow the language. Edited ones are left alone.
 */
export async function upgradeLegacyScripts(tx: Pick<Tx, "script">, workspaceId: string) {
  const plain = await tx.script.findMany({ where: { workspaceId, starterKey: null }, select: { id: true, title: true, body: true, stage: true } });
  let upgraded = 0;
  for (const r of plain) {
    let key: string | null = null;
    for (const set of Object.values(LEGACY_STARTERS)) {
      const i = set.findIndex((l) => l.stage === r.stage && same(l.title, r.title) && same(l.body, r.body));
      if (i >= 0) {
        key = starterKeyOf(i);
        break;
      }
    }
    if (key) {
      await tx.script.update({ where: { id: r.id }, data: { starterKey: key, situation: starterSituation(Number(key.slice(1))) } });
      upgraded++;
    }
  }
  return upgraded;
}

/** The team's scripts and the member's own. Other people's own scripts are theirs alone. */
export async function listScripts(userId: string, workspaceId: string, locale?: string | null) {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const lang = await scriptLocale(userId, locale);
  await upgradeLegacyScripts(db, workspaceId);
  const rows = await db.script.findMany({ where: { workspaceId, OR: [{ ownerId: null }, { ownerId: userId }] }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return { items: rows.map((r) => dto(r, userId, lang)) };
}

export async function createScript(userId: string, workspaceId: string, input: z.infer<typeof createScriptSchema>, locale?: string | null) {
  const lang = await scriptLocale(userId, locale);
  return db.$transaction(async (tx) => {
    const m = await loadWorkspaceMember(tx, userId, workspaceId, "crm:write");
    if (input.shared && !can(m, "workspace:update")) throw forbidden();
    const count = await tx.script.count({ where: { workspaceId } });
    if (count >= SCRIPT_LIMIT) throw invalid("script_limit", `A workspace holds up to ${SCRIPT_LIMIT} scripts`);
    const s = await tx.script.create({ data: { workspaceId, title: input.title, stage: input.stage, situation: input.situation ?? null, body: input.body, ownerId: input.shared ? null : userId, position: count, createdById: userId } });
    await logActivity(tx, { workspaceId, nodeId: null, actorId: userId, action: "script.created", diff: { title: s.title, shared: !!input.shared } });
    return dto(s, userId, lang);
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

/**
 * Any edit of a ready-made script freezes it: what the person saw (in their language) is stored as the script's own words, the key is dropped,
 * and from then on the script no longer follows the language or any later change of the ready-made set.
 */
export async function updateScript(userId: string, id: string, patch: z.infer<typeof patchScriptSchema>, locale?: string | null) {
  const lang = await scriptLocale(userId, locale);
  return db.$transaction(async (tx) => {
    const s = await loadScript(tx, userId, id);
    const data = s.starterKey ? { ...shownText(s, lang), ...patch, starterKey: null } : patch;
    return dto(await tx.script.update({ where: { id }, data }), userId, lang);
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
export async function copyScript(userId: string, id: string, locale?: string | null) {
  const lang = await scriptLocale(userId, locale);
  return db.$transaction(async (tx) => {
    const s = await tx.script.findUnique({ where: { id } });
    if (!s) throw notFound("script");
    await loadWorkspaceMember(tx, userId, s.workspaceId, "crm:write");
    if (s.ownerId !== null && s.ownerId !== userId) throw notFound("script");
    const count = await tx.script.count({ where: { workspaceId: s.workspaceId } });
    if (count >= SCRIPT_LIMIT) throw invalid("script_limit", `A workspace holds up to ${SCRIPT_LIMIT} scripts`);
    const copy = await tx.script.create({ data: { workspaceId: s.workspaceId, ...shownText(s, lang), stage: s.stage, situation: s.situation, ownerId: userId, position: count, createdById: userId } });
    await logActivity(tx, { workspaceId: s.workspaceId, nodeId: null, actorId: userId, action: "script.copied", diff: { title: s.title } });
    return dto(copy, userId, lang);
  });
}

export const starterScriptsSchema = z.object({ locale: z.enum(["ru", "en", "pl", "uk"]).optional() });

/**
 * The ready-made scripts for every stage of the funnel. A leader adds them for the whole team; anybody else for themselves.
 * Each is stored with its key, so it shows in the language of the screen until somebody edits it.
 * Safe to press again: a ready-made script is not added twice, whether it still has its key or was edited (then its title, in any language, is still there).
 * Returns how many were added and skipped.
 */
export async function addStarterScripts(userId: string, workspaceId: string, locale?: string | null) {
  const lang = starterLocale(locale);
  return db.$transaction(async (tx) => {
    const m = await loadWorkspaceMember(tx, userId, workspaceId, "crm:write");
    const shared = can(m, "workspace:update");
    await upgradeLegacyScripts(tx, workspaceId);
    const wanted = STARTER_SCRIPTS[lang];
    const have = await tx.script.findMany({ where: { workspaceId, OR: [{ ownerId: null }, { ownerId: userId }] }, select: { title: true, starterKey: true } });
    const keys = new Set(have.map((h) => h.starterKey));
    const titles = new Set(have.map((h) => h.title.trim().toLowerCase()));
    const known = (i: number) => keys.has(starterKeyOf(i)) || [STARTER_SCRIPTS, LEGACY_STARTERS].some((sets) => Object.values(sets).some((set) => set[i] && titles.has(set[i].title.trim().toLowerCase())));
    const total = await tx.script.count({ where: { workspaceId } });
    const fresh = wanted.map((t, i) => ({ t, i })).filter(({ i }) => !known(i));
    if (total + fresh.length > SCRIPT_LIMIT) throw invalid("script_limit", `A workspace holds up to ${SCRIPT_LIMIT} scripts`);
    if (fresh.length) {
      await tx.script.createMany({ data: fresh.map(({ t, i }, k) => ({ workspaceId, title: t.title, stage: t.stage, situation: starterSituation(i), body: t.body, starterKey: starterKeyOf(i), ownerId: shared ? null : userId, position: total + k, createdById: userId })) });
      await logActivity(tx, { workspaceId, nodeId: null, actorId: userId, action: "script.starter_added", diff: { added: fresh.length } });
    }
    return { added: fresh.length, skipped: wanted.length - fresh.length };
  });
}
