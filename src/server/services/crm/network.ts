import { db } from "@/server/db";
import { loadWorkspaceMember } from "@/server/services/nodes/access";
import { fullName } from "./common";

/** Everyone the network map draws; beyond this the map would be unreadable, and the view says it was cut. */
export const NETWORK_LIMIT = 2000;

/** The light facts about every person and group the network map needs, in one read. */
export async function getNetwork(userId: string, workspaceId: string) {
  await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const [me, rows, groups, total] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
    db.contact.findMany({
      where: { workspaceId, node: { archivedAt: null } },
      orderBy: [{ stage: "desc" }, { firstName: "asc" }],
      take: NETWORK_LIMIT,
      select: { nodeId: true, firstName: true, lastName: true, stage: true, temperature: true, sponsorId: true, heldById: true, groupId: true, influence: true, country: true, typeTag: true },
    }),
    db.contactGroup.findMany({ where: { workspaceId }, select: { id: true, parentId: true, name: true, color: true, position: true } }),
    db.contact.count({ where: { workspaceId, node: { archivedAt: null } } }),
  ]);
  return {
    rootName: me?.name ?? me?.email ?? "",
    people: rows.map((r) => ({ id: r.nodeId, name: fullName(r.firstName, r.lastName), stage: r.stage, temperature: r.temperature, sponsorId: r.sponsorId, heldById: r.heldById, groupId: r.groupId, influence: r.influence, country: r.country, typeTag: r.typeTag })),
    groups,
    truncated: total > rows.length,
    total,
  };
}
