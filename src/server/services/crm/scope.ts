import type { Membership, Prisma } from "@prisma/client";
import { crmLevel, personalLevel, poolReach, reachOf } from "@/modules/crm/access";
import { descendantIds } from "@/modules/crm/groups";
import type { Tx } from "@/server/services/nodes/access";

type Who = Pick<Membership, "role" | "crmAccess" | "crmScope" | "teamScope" | "userId" | "workspaceId">;

/** Whether the workspace keeps people private: owners, admins and members with wide access see only their own people and what was shared. */
export async function contactsPrivate(tx: Tx, workspaceId: string): Promise<boolean> {
  const w = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { contactPrivacy: true } });
  return w?.contactPrivacy !== "OPEN";
}

/**
 * Which people a member may see, as a filter for `contact` queries; `null` means all of them.
 * In a private workspace (the default) nobody sees all of them, whatever their role: only their own people, those held by their own
 * partner card, what was shared with them and what a hand-made team pools. In an open workspace owners, admins and members with the whole CRM are not filtered. A scoped member (own people or their team's) sees the people they own,
 * the people held by their partner card (or those of their line, for the team scope), those partner cards, and what was shared with them
 * (a contact, or a whole group with its subgroups). With `write`, only what they may change: view-only shares are left out.
 */
export async function contactScope(tx: Tx, m: Who, opts: { write?: boolean } = {}): Promise<Prisma.ContactWhereInput | null> {
  const level = crmLevel(m);
  if (level === "NONE") return { nodeId: { in: [] } };
  const priv = await contactsPrivate(tx, m.workspaceId);
  if (level === "ALL" && !priv) return null;
  const links = await tx.contact.findMany({
    where: { workspaceId: m.workspaceId, OR: [{ sponsorId: { not: null } }, { linkedUserId: { not: null } }] },
    select: { nodeId: true, sponsorId: true, linkedUserId: true },
  });
  const flat = links.map((l) => ({ id: l.nodeId, sponsorId: l.sponsorId, linkedUserId: l.linkedUserId }));
  // The line below a member is theirs to see only in an open workspace; private ones show it as numbers, never as people.
  const reach = reachOf(!priv && personalLevel(m) === "TEAM" ? "TEAM" : "OWN", m.userId, flat);
  if (m.teamScope === "TEAM" || (priv && m.teamScope === "ALL")) {
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

/**
 * The people whose turn it is before `dayEnd`: those whose next step is due, and those who said no or went quiet and whose day to come back has come.
 * The ones out of the funnel stay out of it, whatever old date they carry, until their own day.
 */
export const dueBefore = (dayEnd: Date): Prisma.ContactWhereInput => ({
  OR: [{ nextStepAt: { lt: dayEnd }, stage: { notIn: ["DECLINED", "NO_REPLY"] } }, { stage: { in: ["DECLINED", "NO_REPLY"] }, returnAt: { lt: dayEnd } }],
});

/** The same filter, joined to a query's own conditions. */
/**
 * A person's own partner card is a link to their account (so they can be named as a sponsor or as the partner who works with someone),
 * not a person to work with: it stays out of their lists and boards, and on the network map it is the middle of the map.
 */
export function withoutSelf(where: Prisma.ContactWhereInput, userId: string): Prisma.ContactWhereInput {
  return { AND: [where, { NOT: { linkedUserId: userId, ownerId: userId, stage: "PARTNER" } }] };
}

export function withScope(where: Prisma.ContactWhereInput, scope: Prisma.ContactWhereInput | null): Prisma.ContactWhereInput {
  return scope ? { AND: [where, scope] } : where;
}

/** Whether one person is inside what the member may see. */
export async function contactVisible(tx: Tx, m: Who, contactId: string, opts: { write?: boolean } = {}): Promise<boolean> {
  const scope = await contactScope(tx, m, opts);
  if (!scope) return true;
  return (await tx.contact.count({ where: { AND: [{ nodeId: contactId }, scope] } })) > 0;
}
