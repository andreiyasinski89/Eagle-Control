import { z } from "zod";
import { db } from "@/server/db";
import { notFound } from "@/server/http/errors";
import { canMoveGroup, depthOf, descendantIds, GROUP_LIMIT, MAX_GROUP_DEPTH } from "@/modules/crm/groups";
import { loadWorkspaceMember, logActivity, type Tx } from "@/server/services/nodes/access";
import { invalid } from "./common";
import { contactScope, withScope } from "./scope";

const name = z.string().trim().min(1).max(60);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable();

export const createGroupSchema = z.object({ name, parentId: z.string().nullable().optional(), color: color.optional() });
export const patchGroupSchema = z
  .object({ name: name.optional(), parentId: z.string().nullable().optional(), color: color.optional(), position: z.number().int().min(0).max(10_000).optional() })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export const assignGroupSchema = z.object({ ids: z.array(z.string()).min(1).max(500), groupId: z.string().nullable() });

/** A group of this workspace, or a 422: used wherever a contact is put in a group. */
export async function assertGroup(tx: Tx, workspaceId: string, groupId: string | null | undefined): Promise<void> {
  if (!groupId) return;
  const g = await tx.contactGroup.findUnique({ where: { id: groupId }, select: { workspaceId: true } });
  if (!g || g.workspaceId !== workspaceId) throw invalid("invalid_group", "Group not found in this workspace");
}

const flat = (tx: Tx, workspaceId: string) => tx.contactGroup.findMany({ where: { workspaceId }, select: { id: true, parentId: true, name: true, color: true, position: true } });

/** The groups with how many people are in each: `own` directly, `total` with everything below. `ungrouped` and `all` are for the top of the list. */
export async function listGroups(userId: string, workspaceId: string) {
  const member = await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const where = withScope({ workspaceId, node: { archivedAt: null } }, await contactScope(db, member));
  const [groups, counts, all] = await Promise.all([
    flat(db, workspaceId),
    db.contact.groupBy({ by: ["groupId"], where, _count: { _all: true } }),
    db.contact.count({ where }),
  ]);
  const own = new Map(counts.map((c) => [c.groupId, c._count._all]));
  const items = groups.map((g) => ({ ...g, own: own.get(g.id) ?? 0, total: descendantIds(groups, g.id).reduce((n, id) => n + (own.get(id) ?? 0), 0) }));
  return { items, ungrouped: own.get(null) ?? 0, all };
}

export async function createGroup(userId: string, workspaceId: string, input: z.infer<typeof createGroupSchema>) {
  return db.$transaction(async (tx) => {
    await loadWorkspaceMember(tx, userId, workspaceId, "crm:write");
    const groups = await flat(tx, workspaceId);
    if (groups.length >= GROUP_LIMIT) throw invalid("group_limit", `A workspace holds up to ${GROUP_LIMIT} groups`);
    const parentId = input.parentId ?? null;
    if (parentId) {
      if (!groups.some((g) => g.id === parentId)) throw invalid("invalid_group", "Parent group not found in this workspace");
      if (depthOf(groups, parentId) >= MAX_GROUP_DEPTH) throw invalid("group_too_deep", `Groups nest ${MAX_GROUP_DEPTH} levels at most`);
    }
    if (groups.some((g) => g.parentId === parentId && g.name.toLowerCase() === input.name.toLowerCase())) throw invalid("group_exists", "A group with this name is already there");
    const position = groups.filter((g) => g.parentId === parentId).reduce((m, g) => Math.max(m, g.position + 1), 0);
    const g = await tx.contactGroup.create({ data: { workspaceId, parentId, name: input.name, color: input.color ?? null, position } });
    await logActivity(tx, { workspaceId, nodeId: null, actorId: userId, action: "contact_group.created", diff: { name: g.name } });
    return g;
  });
}

async function loadGroup(tx: Tx, userId: string, groupId: string) {
  const g = await tx.contactGroup.findUnique({ where: { id: groupId } });
  if (!g) throw notFound("group");
  await loadWorkspaceMember(tx, userId, g.workspaceId, "crm:full");
  return g;
}

export async function updateGroup(userId: string, groupId: string, patch: z.infer<typeof patchGroupSchema>) {
  return db.$transaction(async (tx) => {
    const g = await loadGroup(tx, userId, groupId);
    const groups = await flat(tx, g.workspaceId);
    const parentId = patch.parentId === undefined ? g.parentId : patch.parentId;
    if (patch.parentId !== undefined && patch.parentId !== g.parentId) {
      if (patch.parentId && !groups.some((x) => x.id === patch.parentId)) throw invalid("invalid_group", "Parent group not found in this workspace");
      const check = canMoveGroup(groups, groupId, patch.parentId);
      if (check === "self" || check === "cycle") throw invalid("group_cycle", "A group cannot go inside itself or its own subgroup");
      if (check === "too_deep") throw invalid("group_too_deep", `Groups nest ${MAX_GROUP_DEPTH} levels at most`);
    }
    const nextName = patch.name ?? g.name;
    if (groups.some((x) => x.id !== groupId && x.parentId === parentId && x.name.toLowerCase() === nextName.toLowerCase())) throw invalid("group_exists", "A group with this name is already there");
    const updated = await tx.contactGroup.update({ where: { id: groupId }, data: { ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}), ...(patch.color !== undefined ? { color: patch.color } : {}), ...(patch.position !== undefined ? { position: patch.position } : {}) } });
    await logActivity(tx, { workspaceId: g.workspaceId, nodeId: null, actorId: userId, action: "contact_group.updated", diff: { fields: Object.keys(patch) } });
    return updated;
  });
}

/** Removing a group never removes people: they, and any subgroups, move up to the parent (or to "no group"). */
export async function deleteGroup(userId: string, groupId: string) {
  return db.$transaction(async (tx) => {
    const g = await loadGroup(tx, userId, groupId);
    const [moved] = await Promise.all([tx.contact.updateMany({ where: { groupId }, data: { groupId: g.parentId } }), tx.contactGroup.updateMany({ where: { parentId: groupId }, data: { parentId: g.parentId } })]);
    await tx.contactGroup.delete({ where: { id: groupId } });
    await logActivity(tx, { workspaceId: g.workspaceId, nodeId: null, actorId: userId, action: "contact_group.deleted", diff: { name: g.name, people: moved.count } });
    return { deleted: true, people: moved.count };
  });
}

/** Puts many people into a group (or takes them out of any group with `groupId: null`) in one go. */
export async function assignToGroup(userId: string, workspaceId: string, input: z.infer<typeof assignGroupSchema>) {
  return db.$transaction(async (tx) => {
    const member = await loadWorkspaceMember(tx, userId, workspaceId, "crm:write");
    await assertGroup(tx, workspaceId, input.groupId);
    const r = await tx.contact.updateMany({ where: withScope({ workspaceId, nodeId: { in: input.ids }, node: { archivedAt: null } }, await contactScope(tx, member)), data: { groupId: input.groupId } });
    await logActivity(tx, { workspaceId, nodeId: null, actorId: userId, action: "contact_group.assigned", diff: { groupId: input.groupId, people: r.count } });
    return { updated: r.count };
  });
}
