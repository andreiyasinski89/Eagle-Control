import type { Membership, Prisma } from "@prisma/client";
import { crmLevel, personalLevel, poolReach, reachOf } from "@/modules/crm/access";
import type { Tx } from "@/server/services/nodes/access";

/**
 * Which people a member may see, as a filter for `contact` queries; `null` means all of them.
 * Owners, admins and members with the whole CRM are not filtered. A scoped member (own people or their team's) sees the people they own,
 * the people held by their partner card (or those of their line, for the team scope), and those partner cards.
 */
export async function contactScope(tx: Tx, m: Pick<Membership, "role" | "crmAccess" | "crmScope" | "teamScope" | "userId" | "workspaceId">): Promise<Prisma.ContactWhereInput | null> {
  const level = crmLevel(m);
  if (level === "ALL") return null;
  if (level === "NONE") return { nodeId: { in: [] } };
  const links = await tx.contact.findMany({
    where: { workspaceId: m.workspaceId, OR: [{ sponsorId: { not: null } }, { linkedUserId: { not: null } }] },
    select: { nodeId: true, sponsorId: true, linkedUserId: true },
  });
  const flat = links.map((l) => ({ id: l.nodeId, sponsorId: l.sponsorId, linkedUserId: l.linkedUserId }));
  const reach = reachOf(personalLevel(m) === "TEAM" ? "TEAM" : "OWN", m.userId, flat);
  if (m.teamScope === "TEAM") {
    // A hand-made team shares its members' people among them.
    const mates = await tx.teamMember.findMany({ where: { team: { workspaceId: m.workspaceId, crmScope: "TEAM", members: { some: { userId: m.userId } } } }, select: { userId: true } });
    const pool = poolReach(flat, mates.map((x) => x.userId));
    reach.userIds = [...new Set([...reach.userIds, ...pool.userIds])];
    reach.partnerIds = [...new Set([...reach.partnerIds, ...pool.partnerIds])];
  }
  const or: Prisma.ContactWhereInput[] = [{ ownerId: { in: reach.userIds } }];
  if (reach.partnerIds.length) or.push({ heldById: { in: reach.partnerIds } }, { nodeId: { in: reach.partnerIds } });
  if (reach.lineIds.length) or.push({ sponsorId: { in: reach.lineIds } });
  return { OR: or };
}

/** The same filter, joined to a query's own conditions. */
export function withScope(where: Prisma.ContactWhereInput, scope: Prisma.ContactWhereInput | null): Prisma.ContactWhereInput {
  return scope ? { AND: [where, scope] } : where;
}

/** Whether one person is inside what the member may see. */
export async function contactVisible(tx: Tx, m: Pick<Membership, "role" | "crmAccess" | "crmScope" | "teamScope" | "userId" | "workspaceId">, contactId: string): Promise<boolean> {
  const scope = await contactScope(tx, m);
  if (!scope) return true;
  return (await tx.contact.count({ where: { AND: [{ nodeId: contactId }, scope] } })) > 0;
}
