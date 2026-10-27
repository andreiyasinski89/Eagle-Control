import { z } from "zod";
import { db } from "@/server/db";
import { ApiError, notFound } from "@/server/http/errors";
import { teamGrant } from "@/modules/crm/access";
import { loadWorkspaceMember, logActivity, type Tx } from "@/server/services/nodes/access";

export const TEAM_LIMIT = 50;

const invalid = (code: string, message: string) => new ApiError(422, code, message);

const name = z.string().trim().min(1).max(60);
/** What the team gives its members in the CRM: TEAM shares their people among them, ALL shows everything; null gives nothing. */
const scope = z.enum(["TEAM", "ALL"]).nullable();

export const createTeamSchema = z.object({
  name,
  leaderId: z.string().nullable().optional(),
  crmScope: scope.optional(),
  memberIds: z.array(z.string()).max(200).default([]),
});
export const patchTeamSchema = z
  .object({ name: name.optional(), leaderId: z.string().nullable().optional(), crmScope: scope.optional(), memberIds: z.array(z.string()).max(200).optional() })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

/** Keeps each member's `teamScope` equal to the best that their teams give; the CRM policies read it from the membership row. */
export async function syncTeamScopes(tx: Tx, workspaceId: string, userIds: readonly string[]): Promise<void> {
  for (const userId of new Set(userIds)) {
    const rows = await tx.teamMember.findMany({ where: { userId, team: { workspaceId } }, select: { team: { select: { crmScope: true } } } });
    await tx.membership.updateMany({ where: { userId, workspaceId }, data: { teamScope: teamGrant(rows.map((r) => r.team.crmScope)) } });
  }
}

/** Only people who work in the workspace belong to a team: owners, admins and members. */
async function assertTeamPeople(tx: Tx, workspaceId: string, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const found = await tx.membership.count({ where: { workspaceId, userId: { in: [...ids] }, role: { in: ["OWNER", "ADMIN", "MEMBER"] } } });
  if (found !== new Set(ids).size) throw invalid("invalid_team_member", "Teams are made of the workspace's owners, admins and members");
}

export async function listTeams(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "member:invite");
  const teams = await db.team.findMany({
    where: { workspaceId },
    orderBy: { name: "asc" },
    include: { members: { select: { userId: true } } },
  });
  return teams.map((t) => ({ id: t.id, name: t.name, leaderId: t.leaderId, crmScope: t.crmScope, memberIds: t.members.map((m) => m.userId) }));
}

export async function createTeam(userId: string, workspaceId: string, input: z.infer<typeof createTeamSchema>) {
  return db.$transaction(async (tx) => {
    await loadWorkspaceMember(tx, userId, workspaceId, "member:invite");
    if ((await tx.team.count({ where: { workspaceId } })) >= TEAM_LIMIT) throw invalid("team_limit", `A workspace holds up to ${TEAM_LIMIT} teams`);
    if (await tx.team.findUnique({ where: { workspaceId_name: { workspaceId, name: input.name } } })) throw new ApiError(409, "team_exists", "A team with this name is already there");
    const leaderId = input.leaderId ?? null;
    const memberIds = [...new Set([...input.memberIds, ...(leaderId ? [leaderId] : [])])];
    await assertTeamPeople(tx, workspaceId, memberIds);
    const team = await tx.team.create({ data: { workspaceId, name: input.name, leaderId, crmScope: input.crmScope ?? null, members: { create: memberIds.map((id) => ({ userId: id })) } } });
    await syncTeamScopes(tx, workspaceId, memberIds);
    await logActivity(tx, { workspaceId, nodeId: null, actorId: userId, action: "team.created", diff: { name: team.name, members: memberIds.length, crmScope: team.crmScope } });
    return { id: team.id };
  });
}

export async function updateTeam(userId: string, teamId: string, patch: z.infer<typeof patchTeamSchema>) {
  return db.$transaction(async (tx) => {
    const team = await tx.team.findUnique({ where: { id: teamId }, include: { members: { select: { userId: true } } } });
    if (!team) throw notFound("team");
    await loadWorkspaceMember(tx, userId, team.workspaceId, "member:invite");
    if (patch.name && patch.name !== team.name && (await tx.team.findUnique({ where: { workspaceId_name: { workspaceId: team.workspaceId, name: patch.name } } }))) throw new ApiError(409, "team_exists", "A team with this name is already there");
    const leaderId = patch.leaderId !== undefined ? patch.leaderId : team.leaderId;
    const before = team.members.map((m) => m.userId);
    const memberIds = patch.memberIds !== undefined || patch.leaderId ? [...new Set([...(patch.memberIds ?? before), ...(leaderId ? [leaderId] : [])])] : before;
    await assertTeamPeople(tx, team.workspaceId, memberIds);
    await tx.team.update({ where: { id: teamId }, data: { ...(patch.name ? { name: patch.name } : {}), ...(patch.leaderId !== undefined ? { leaderId } : {}), ...(patch.crmScope !== undefined ? { crmScope: patch.crmScope } : {}) } });
    if (memberIds.length !== before.length || memberIds.some((id) => !before.includes(id))) {
      await tx.teamMember.deleteMany({ where: { teamId, userId: { notIn: memberIds } } });
      await tx.teamMember.createMany({ data: memberIds.filter((id) => !before.includes(id)).map((id) => ({ teamId, userId: id })) });
    }
    await syncTeamScopes(tx, team.workspaceId, [...before, ...memberIds]);
    await logActivity(tx, { workspaceId: team.workspaceId, nodeId: null, actorId: userId, action: "team.updated", diff: { name: patch.name ?? team.name, fields: Object.keys(patch) } });
    return { id: teamId };
  });
}

export async function deleteTeam(userId: string, teamId: string) {
  return db.$transaction(async (tx) => {
    const team = await tx.team.findUnique({ where: { id: teamId }, include: { members: { select: { userId: true } } } });
    if (!team) throw notFound("team");
    await loadWorkspaceMember(tx, userId, team.workspaceId, "member:invite");
    await tx.team.delete({ where: { id: teamId } });
    await syncTeamScopes(tx, team.workspaceId, team.members.map((m) => m.userId));
    await logActivity(tx, { workspaceId: team.workspaceId, nodeId: null, actorId: userId, action: "team.deleted", diff: { name: team.name } });
    return { deleted: true };
  });
}
