import type { Membership, Prisma } from "@prisma/client";
import { crmLevel, personalLevel, poolReach, reachOf } from "@/modules/crm/access";
import { descendantIds } from "@/modules/crm/groups";
import type { Tx } from "@/server/services/nodes/access";

type Who = Pick<Membership, "role" | "crmAccess" | "crmScope" | "teamScope" | "userId" | "workspaceId">;

/**
 * Which people a member may see, as a filter for `contact` queries; `null` means all of them.
 * Owners, admins and members with the whole CRM are not filtered. A scoped member (own people or their team's) sees the people they own,
 * the people held by their partner card (or those of their line, for the team scope), those partner cards, and what was shared with them
 * (a contact, or a whole group with its subgroups). With `write`, only what they may change: view-only shares are left out.
 */
export async function contactScope(tx: Tx, m: Who, opts: { write?: boolean } = {}): Promise<Prisma.ContactWhereInput | null> {
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
  const shares = await tx.contactShare.findMany({
    where: { workspaceId: m.workspaceId, ...(opts.write ? { level: "EDIT" as const } : {}), OR: [{ userId: m.userId }, { team: { members: { some: { userId: m.userId } } } }] },
    select: { contactId: true, groupId: true },
  });
  const contactIds = shares.map((s) => s.contactId).filter((x): x is string => !!x);
  const groupIds = shares.map((s) => s.groupId).filter((x): x is string => !!x);
  if (contactIds.length) or.push({ nodeId: { in: contactIds } });
  if (groupIds.length) {
    const groups = await tx.contactGroup.findMany({ where: { workspaceId: m.workspaceId }, select: { id: true, parentId: true } });
    or.push({ groupId: { in: [...new Set(groupIds.flatMap((g) => descendantIds(groups, g)))] } });
  }
  return { OR: or };
}

/** The same filter, joined to a query's own conditions. */
export function withScope(where: Prisma.ContactWhereInput, scope: Prisma.ContactWhereInput | null): Prisma.ContactWhereInput {
  return scope ? { AND: [where, scope] } : where;
}

/** Whether one person is inside what the member may see. */
export async function contactVisible(tx: Tx, m: Who, contactId: string, opts: { write?: boolean } = {}): Promise<boolean> {
  const scope = await contactScope(tx, m, opts);
  if (!scope) return true;
  return (await tx.contact.count({ where: { AND: [{ nodeId: contactId }, scope] } })) > 0;
}
