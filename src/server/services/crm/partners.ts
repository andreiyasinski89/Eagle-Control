import { z } from "zod";
import { db } from "@/server/db";
import { descendantIds } from "@/modules/crm/groups";
import { sponsorWouldLoop, teamSizes } from "@/modules/crm/partners";
import { loadWorkspaceMember, logActivity, type Tx } from "@/server/services/nodes/access";
import { fullName, invalid, loadCrmNode } from "./common";
import { contactScope, contactVisible, withScope } from "./scope";

export const transferSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  /** The partner who takes the people over; null takes them back from whoever holds them. */
  toPartnerId: z.string().nullable(),
  note: z.string().trim().max(500).optional(),
});

/** A partner of this workspace (a contact in the Partner stage), or a 422. */
async function loadPartner(tx: Tx, workspaceId: string, id: string, code: string) {
  const p = await tx.contact.findUnique({ where: { nodeId: id }, select: { nodeId: true, workspaceId: true, stage: true, firstName: true, lastName: true, linkedUserId: true, node: { select: { archivedAt: true } } } });
  if (!p || p.workspaceId !== workspaceId || p.node.archivedAt) throw invalid(code, "Partner not found in this workspace");
  if (p.stage !== "PARTNER") throw invalid("not_partner", "This person is not in the Partner stage");
  return p;
}

/**
 * Checks what a contact's partner links point at: the sponsor must be a partner and may not sit below the person (no loops);
 * a linked account must belong to a member of the workspace. `contactId` is null while the contact is being created.
 */
export async function assertPartnerLinks(tx: Tx, workspaceId: string, contactId: string | null, links: { sponsorId?: string | null; linkedUserId?: string | null }): Promise<void> {
  if (links.sponsorId) {
    await loadPartner(tx, workspaceId, links.sponsorId, "invalid_sponsor");
    if (contactId) {
      const tree = await tx.contact.findMany({ where: { workspaceId, sponsorId: { not: null } }, select: { nodeId: true, sponsorId: true } });
      if (sponsorWouldLoop(tree.map((t) => ({ id: t.nodeId, parentId: t.sponsorId })), contactId, links.sponsorId)) throw invalid("sponsor_loop", "A person cannot be placed below themselves in the sponsor tree");
    }
  }
  if (links.linkedUserId) {
    const m = await tx.membership.findUnique({ where: { userId_workspaceId: { userId: links.linkedUserId, workspaceId } } });
    if (!m || m.role === "CLIENT") throw invalid("invalid_linked_user", "The linked account must belong to a member of the workspace");
  }
}

/**
 * The team as a tree: every partner with the people they hold, the people brought through them and the size of their whole line.
 * A partner whose sponsor is not a partner (or who has none) stands at the top.
 */
export async function listPartners(userId: string, workspaceId: string) {
  const member = await loadWorkspaceMember(db, userId, workspaceId, "crm:read");
  const scope = await contactScope(db, member);
  const rows = await db.contact.findMany({
    where: withScope({ workspaceId, node: { archivedAt: null }, OR: [{ stage: "PARTNER" }, { sponsorId: { not: null } }] }, scope),
    select: { nodeId: true, firstName: true, lastName: true, stage: true, sponsorId: true, linkedUserId: true, country: true, stageChangedAt: true },
  });
  const held = await db.contact.groupBy({ by: ["heldById"], where: withScope({ workspaceId, node: { archivedAt: null }, heldById: { not: null } }, scope), _count: { _all: true } });
  const heldBy = new Map(held.map((h) => [h.heldById as string, h._count._all]));
  const ids = new Set(rows.map((r) => r.nodeId));
  const tree = rows.map((r) => ({ id: r.nodeId, parentId: r.sponsorId && ids.has(r.sponsorId) ? r.sponsorId : null }));
  const team = teamSizes(tree);
  const partnerIds = new Set(rows.filter((r) => r.stage === "PARTNER").map((r) => r.nodeId));
  const users = await db.user.findMany({ where: { id: { in: rows.map((r) => r.linkedUserId).filter((x): x is string => !!x) } }, select: { id: true, name: true, email: true } });
  const userName = new Map(users.map((u) => [u.id, u.name ?? u.email]));
  const items = rows
    .filter((r) => r.stage === "PARTNER")
    .map((r) => ({
      id: r.nodeId,
      name: fullName(r.firstName, r.lastName),
      // Climb to the nearest partner above: people who are not partners are leaves, not branches, of the team tree.
      parentId: (() => {
        let up = r.sponsorId;
        for (let i = 0; up && !partnerIds.has(up) && i < 20; i++) up = rows.find((x) => x.nodeId === up)?.sponsorId ?? null;
        return up && partnerIds.has(up) ? up : null;
      })(),
      country: r.country,
      linkedUserId: r.linkedUserId,
      linkedUserName: r.linkedUserId ? (userName.get(r.linkedUserId) ?? null) : null,
      held: heldBy.get(r.nodeId) ?? 0,
      direct: rows.filter((x) => x.sponsorId === r.nodeId).length,
      team: team.get(r.nodeId) ?? 0,
      partnersBelow: descendantIds(tree, r.nodeId).filter((x) => x !== r.nodeId && partnerIds.has(x)).length,
      since: r.stageChangedAt,
    }));
  return { items };
}

/**
 * Hands people over to a partner (or takes them back). A partner who has an account gets them as their own (they become the owner),
 * one without keeps working through the owner and receives a handoff card. Every hand-over is written to the person's history.
 */
export async function transferContacts(userId: string, workspaceId: string, input: z.infer<typeof transferSchema>) {
  return db.$transaction(
    async (tx) => {
      const member = await loadWorkspaceMember(tx, userId, workspaceId, "crm:write");
      const scope = await contactScope(tx, member, { write: true });
      const to = input.toPartnerId ? await loadPartner(tx, workspaceId, input.toPartnerId, "invalid_partner") : null;
      if (to && !(await contactVisible(tx, member, to.nodeId, { write: true }))) throw invalid("invalid_partner", "Partner not found in this workspace");
      const people = await tx.contact.findMany({ where: withScope({ workspaceId, nodeId: { in: input.ids }, node: { archivedAt: null } }, scope), select: { nodeId: true, heldById: true, ownerId: true, companyId: true, heldBy: { select: { linkedUserId: true, firstName: true, lastName: true } } } });
      const moving = people.filter((p) => p.heldById !== (to?.nodeId ?? null) && p.nodeId !== to?.nodeId);
      if (moving.length === 0) return { moved: 0, skipped: input.ids.length, ids: [] as string[] };

      const toName = to ? fullName(to.firstName, to.lastName) : null;
      const now = new Date();
      const ownerFor = (p: (typeof moving)[number]) => (to?.linkedUserId ? to.linkedUserId : p.heldBy?.linkedUserId ? userId : p.ownerId);
      await tx.contactTransfer.createMany({ data: moving.map((p) => ({ contactNodeId: p.nodeId, workspaceId, fromHeldId: p.heldById, toHeldId: to?.nodeId ?? null, fromOwnerId: p.ownerId, toOwnerId: ownerFor(p), note: input.note || null, actorId: userId, at: now })) });
      await tx.contact.updateMany({ where: { nodeId: { in: moving.map((p) => p.nodeId) } }, data: { heldById: to?.nodeId ?? null } });
      const byOwner = new Map<string, string[]>();
      for (const p of moving) {
        const o = ownerFor(p);
        if (o && o !== p.ownerId) byOwner.set(o, [...(byOwner.get(o) ?? []), p.nodeId]);
      }
      for (const [ownerId, ids] of byOwner) await tx.contact.updateMany({ where: { nodeId: { in: ids } }, data: { ownerId } });
      await tx.crmActivity.createMany({
        data: moving.map((p) => ({ workspaceId, type: "NOTE" as const, subject: toName ? `Handed over to ${toName}` : "Taken back from a partner", body: input.note || null, ownerId: userId, contactId: p.nodeId, companyId: p.companyId, completedAt: now })),
      });
      await logActivity(tx, { workspaceId, nodeId: null, actorId: userId, action: "contact.transferred", diff: { to: toName, people: moving.length } });
      return { moved: moving.length, skipped: input.ids.length - moving.length, ids: moving.map((p) => p.nodeId) };
    },
    { timeout: 60_000, maxWait: 30_000 },
  );
}

/** What a partner needs to know about a person handed to them: how to reach them, where they stand, what was said last. */
export async function getHandoffCard(userId: string, contactId: string) {
  return db.$transaction(async (tx) => {
    const node = await loadCrmNode(tx, userId, contactId, "CONTACT");
    const c = await tx.contact.findUniqueOrThrow({ where: { nodeId: contactId }, include: { group: { select: { name: true } } } });
    const notes = await tx.crmActivity.findMany({ where: { contactId, type: "NOTE", body: { not: null } }, orderBy: { createdAt: "desc" }, take: 5, select: { createdAt: true, subject: true, body: true } });
    const m = c.messengers as Record<string, string>;
    return {
      id: node.id,
      name: node.title,
      stage: c.stage,
      temperature: c.temperature,
      phones: c.phones,
      emails: c.emails,
      telegram: m.telegram ?? null,
      whatsapp: m.whatsapp ?? null,
      instagram: m.instagram ?? null,
      country: c.country,
      source: c.source,
      interests: c.interests,
      nextStep: c.nextStep,
      nextStepAt: c.nextStepAt?.toISOString() ?? null,
      group: c.group?.name ?? null,
      notes: notes.reverse().map((n) => ({ at: n.createdAt.toISOString(), text: n.body ?? n.subject })),
    };
  });
}

/** The hand-over history of one person, newest first, with the partners' names. */
export async function listTransfers(tx: Tx, contactId: string) {
  const rows = await tx.contactTransfer.findMany({ where: { contactNodeId: contactId }, orderBy: { at: "desc" }, take: 20 });
  const partnerIds = [...new Set(rows.flatMap((r) => [r.fromHeldId, r.toHeldId]).filter((x): x is string => !!x))];
  const partners = partnerIds.length ? await tx.contact.findMany({ where: { nodeId: { in: partnerIds } }, select: { nodeId: true, firstName: true, lastName: true } }) : [];
  const name = new Map(partners.map((p) => [p.nodeId, fullName(p.firstName, p.lastName)]));
  const actors = await tx.user.findMany({ where: { id: { in: rows.map((r) => r.actorId).filter((x): x is string => !!x) } }, select: { id: true, name: true, email: true } });
  const actor = new Map(actors.map((a) => [a.id, a.name ?? a.email]));
  return rows.map((r) => ({ id: r.id, at: r.at, from: r.fromHeldId ? (name.get(r.fromHeldId) ?? null) : null, to: r.toHeldId ? (name.get(r.toHeldId) ?? null) : null, note: r.note, by: r.actorId ? (actor.get(r.actorId) ?? null) : null }));
}
